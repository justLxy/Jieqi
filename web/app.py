#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
中国暗棋（揭棋）Web版后端API服务器
集成 C++ AI 引擎
"""

import sys
import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import math

# 导入新的 C++ AI 引擎
try:
    import cppjieqi
    print(f"Loaded cppjieqi module from: {cppjieqi.__file__}") # 打印模块路径
    AI_AVAILABLE = True
    print("C++ AI engine loaded successfully")
except ImportError as e:
    print(f"Warning: Could not import C++ AI engine: {e}")
    AI_AVAILABLE = False

app = Flask(__name__)
CORS(app)

class WebJieqiAI:
    """Web版暗棋AI接口"""
    
    def __init__(self):
        self.game_id = None
        self.initialize_ai()
        
    def __del__(self):
        if AI_AVAILABLE and self.game_id is not None:
            try:
                cppjieqi.delete_game(self.game_id)
                print(f"C++ game instance {self.game_id} deleted.")
            except Exception as e:
                print(f"Error deleting game instance {self.game_id}: {e}")

    def initialize_ai(self):
        """初始化AI引擎"""
        if not AI_AVAILABLE:
            return False
        try:
            cppjieqi.initialize()
            self.game_id = cppjieqi.create_game()
            print(f"C++ AI engine initialized and game instance {self.game_id} created.")
            return True
        except Exception as e:
            print(f"C++ AI initialization failed: {e}")
            self.game_id = None
            return False

    def ucci_to_web_move(self, ucci_move):
        """将UCCI走法格式 'a0i9' 转换为web格式"""
        if not ucci_move or len(ucci_move) != 4:
            return None
        
        try:
            from_col = ord(ucci_move[0]) - ord('a')
            from_row = int(ucci_move[1])
            to_col = ord(ucci_move[2]) - ord('a')
            to_row = int(ucci_move[3])

            return {
                'from': {'row': from_row, 'col': from_col},
                'to': {'row': to_row, 'col': to_col}
            }
        except (ValueError, IndexError):
            return None

    def get_ai_recommendation(self, web_board, current_player, history, depth):
        """获取AI推荐走法"""
        if not AI_AVAILABLE:
            return {
                'success': False,
                'error': 'AI engine not available'
            }
        
        if self.game_id is None:
            return {
                'success': False,
                'error': 'AI game instance not created'
            }
        
        try:
            start_time = time.time()

            # 1. 将10x9的web_board二维数组展平为90个字符的字符串
            board_str = "".join(["".join(row) for row in web_board])
            
            # 2. 确定当前是否为红方回合
            is_red_turn = current_player == 'red'
            
            # 3. 将前端传来的历史记录（对象列表）转换为C++引擎需要的棋盘字符串列表
            history_board_strings = []
            if history and isinstance(history[0], dict):
                for move_obj in history:
                    if 'boardStateAfter' in move_obj:
                        board_state_2d = move_obj['boardStateAfter']
                        history_board_strings.append("".join(["".join(row) for row in board_state_2d]))
            else:
                history_board_strings = history # 假设已经是字符串列表

            # 4. 设置C++引擎的棋盘状态
            cppjieqi.set_board(self.game_id, board_str, is_red_turn, history_board_strings)

            # 5. 调用C++ AI引擎获取最佳走法 (UCCI格式)
            ai_move_ucci = cppjieqi.get_ai_move(self.game_id, depth)
            
            search_time = time.time() - start_time
            
            if not ai_move_ucci or "ERROR" in ai_move_ucci:
                return {
                    'success': False,
                    'error': f'AI engine returned an error: {ai_move_ucci}'
                }

            print(f"C++ AI returned move: {ai_move_ucci}, time: {search_time:.3f}s")
            
            # 4. 将UCCI走法转换为Web前端需要的格式
            web_move = self.ucci_to_web_move(ai_move_ucci)
            if not web_move:
                return {
                    'success': False,
                    'error': f'Failed to parse AI move: {ai_move_ucci}'
                }
            
            # 计算与C++一致的 quiesc_depth（round<15 -> 2，否则 1）
            round_num = len(history_board_strings) // 2
            quiesc_depth = 2 if round_num < 15 else 1
            
            # 5. 组装返回给前端的数据
            from_piece = web_board[web_move['from']['row']][web_move['from']['col']]
            to_piece = web_board[web_move['to']['row']][web_move['to']['col']]

            return {
                'success': True,
                'move': {
                    'from': web_move['from'],
                    'to': web_move['to'],
                    'piece': from_piece,
                    'capturedPiece': to_piece,
                    'isCapture': to_piece != '.'
                },
                'score': 0,
                'depth': depth,
                'search_time': round(search_time, 3),
                'details': [f"C++ AI recommended move: {ai_move_ucci} (depth={depth}, quiesc_depth={quiesc_depth})"]
            }
            
        except Exception as e:
            print(f"AI recommendation error: {e}")
            return {
                'success': False,
                'error': f'AI error: {str(e)}'
            }

    def _score_to_wdl(self, score_for_red: float, move_count: int = 0):
        # 基于评分的快速概率映射（可后续标定）
        # 红方评分为正 → 红方胜率高；为负 → 黑方胜率高
        # s 控制曲线陡峭度；draw_base 控制和棋基准概率，随优势增大而衰减
        s = 350.0
        draw_base = 0.12
        # 让残局（步数多）和棋概率更低一些
        phase = max(0.0, 1.0 - min(move_count, 80) / 80.0)
        draw_prob = draw_base * (0.6 + 0.4 * phase) * (1.0 - math.tanh(abs(score_for_red) / 500.0))
        # 红方胜率（不含和棋）
        p_red_raw = 1.0 / (1.0 + math.exp(-score_for_red / s))
        p_black_raw = 1.0 - p_red_raw
        # 归一化到剩余概率（1 - draw）
        remain = max(1e-6, 1.0 - draw_prob)
        p_red = p_red_raw * remain
        p_black = p_black_raw * remain
        # 再归一一次以防数值误差
        total = p_red + p_black + draw_prob
        if total > 0:
            p_red /= total
            p_black /= total
            draw_prob /= total
        return {
            'red_win': round(p_red, 4),
            'draw': round(draw_prob, 4),
            'black_win': round(p_black, 4)
        }

    def evaluate_position(self, web_board, current_player, history):
        """评估当前局面"""
        if not AI_AVAILABLE:
            return {
                'success': False,
                'error': 'AI engine not available'
            }
        if self.game_id is None:
            return {
                'success': False,
                'error': 'AI game instance not created'
            }
        try:
            board_str = "".join(["".join(row) for row in web_board])
            is_red_turn = current_player == 'red'
            
            # 将历史记录转换为棋盘字符串列表
            history_board_strings = []
            if history and isinstance(history[0], dict):
                for move_obj in history:
                    if 'boardStateAfter' in move_obj:
                        board_state_2d = move_obj['boardStateAfter']
                        history_board_strings.append("".join(["".join(row) for row in board_state_2d]))
            else:
                history_board_strings = history

            # 设置C++引擎的棋盘状态
            cppjieqi.set_board(self.game_id, board_str, is_red_turn, history_board_strings)

            # C++引擎返回相对于当前玩家的分数
            score_relative = cppjieqi.get_board_evaluation(self.game_id)

            # 将分数统一转换为红方视角
            score_for_red = score_relative if is_red_turn else -score_relative

            # 根据红方分数判断局面
            advantage_level = "balanced"
            advantage_side = "none"
            evaluation_text = "均势"

            if score_for_red > 200:
                advantage_level = "decisive_advantage"
                advantage_side = "red"
                evaluation_text = "红方巨大优势"
            elif score_for_red > 50:
                advantage_level = "slight_advantage"
                advantage_side = "red"
                evaluation_text = "红方优势"
            elif score_for_red < -200:
                advantage_level = "decisive_advantage"
                advantage_side = "black"
                evaluation_text = "黑方巨大优势"
            elif score_for_red < -50:
                advantage_level = "slight_advantage"
                advantage_side = "black"
                evaluation_text = "黑方优势"
            
            # 将分数映射到0-100的百分比，用于优势条显示
            # 使用tanh函数使分数在极端情况下变化更平滑
            percentage_red = 50 + 25 * math.tanh(score_for_red / 400.0)
            percentage = max(5, min(95, percentage_red))

            return {
                'success': True,
                'score': score_for_red,
                'evaluation': evaluation_text,
                'advantage': {'level': advantage_level, 'side': advantage_side, 'percentage': percentage}
            }
        except Exception as e:
            print(f"Position evaluation error: {e}")
            return {
                'success': False,
                'error': f'Evaluation error: {str(e)}'
            }


# 创建AI实例
ai_engine = WebJieqiAI()

@app.route('/')
def index():
    """服务主页面"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """服务静态文件"""
    return send_from_directory('.', filename)

@app.route('/api/ai-recommendation', methods=['POST'])
def ai_recommendation():
    """AI推荐接口"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        web_board = data.get('board')
        current_player = data.get('currentPlayer', 'red')
        history = data.get('history', [])
        
        if not web_board:
            return jsonify({
                'success': False,
                'error': 'Board data required'
            }), 400

        # 从请求中获取depth参数，如果没有则使用默认值
        depth = data.get('depth', 9)
        
        # 调用 get_ai_recommendation 辅助函数
        recommendation = ai_engine.get_ai_recommendation(web_board, current_player, history, depth)
        
        if recommendation['success']:
            return jsonify(recommendation)
        else:
            return jsonify(recommendation), 500
            
    except Exception as e:
        print(f"API error: {e}")
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/api/position-evaluation', methods=['POST'])
def position_evaluation():
    """局面评估接口"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        web_board = data.get('board')
        current_player = data.get('currentPlayer', 'red')
        history = data.get('history', [])
        
        if not web_board:
            return jsonify({
                'success': False,
                'error': 'Board data required'
            }), 400
        
        evaluation = ai_engine.evaluate_position(web_board, current_player, history)
        
        return jsonify(evaluation)
        
    except Exception as e:
        print(f"Position evaluation error: {e}")
        return jsonify({
            'success': False,
            'error': f'Evaluation error: {str(e)}'
        }), 500

@app.route('/api/win-probability', methods=['POST'])
def win_probability():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        web_board = data.get('board')
        current_player = data.get('currentPlayer', 'red')
        history = data.get('history', [])
        if not web_board:
            return jsonify({'success': False, 'error': 'Board data required'}), 400
        
        if ai_engine.game_id is None:
            return jsonify({'success': False, 'error': 'AI game instance not created'}), 500

        # 计算红方视角评分
        board_str = "".join(["".join(row) for row in web_board])
        is_red_turn = current_player == 'red'

        # 将历史记录转换为棋盘字符串列表
        history_board_strings = []
        if history and isinstance(history[0], dict):
            for move_obj in history:
                if 'boardStateAfter' in move_obj:
                    board_state_2d = move_obj['boardStateAfter']
                    history_board_strings.append("".join(["".join(row) for row in board_state_2d]))
        else:
            history_board_strings = history
        
        # Set the board state in the C++ engine first
        cppjieqi.set_board(ai_engine.game_id, board_str, is_red_turn, history_board_strings)
        
        # Now get the evaluation
        score_relative = cppjieqi.get_board_evaluation(ai_engine.game_id)
        score_for_red = score_relative if is_red_turn else -score_relative
        # 转为 WDL 概率
        wdl = ai_engine._score_to_wdl(score_for_red, move_count=len(history))
        # 当前走子方胜率（视角）
        current_winrate = wdl['red_win'] if current_player == 'red' else wdl['black_win']
        return jsonify({
            'success': True,
            'score_for_red': score_for_red,
            'wdl': wdl,
            'current_player': current_player,
            'current_player_winrate': round(current_winrate, 4)
        })
    except Exception as e:
        print(f"Win probability error: {e}")
        return jsonify({'success': False, 'error': f'WDL error: {str(e)}'}), 500

@app.route('/api/game-status', methods=['GET'])
def game_status():
    """获取游戏状态"""
    return jsonify({
        'ai_available': AI_AVAILABLE,
        'server_time': time.time(),
        'version': '2.0.0-cpp' # 更新版本号
    })

if __name__ == '__main__':
    print("Starting Jieqi Web Server with C++ AI Engine...")
    print(f"AI Engine Available: {AI_AVAILABLE}")
    
    app.run(host='0.0.0.0', port=8000, debug=False) # 生产环境建议关闭debug
