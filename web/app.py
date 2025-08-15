#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
中国暗棋（揭棋）Web版后端API服务器
集成现有的musesfish AI引擎
"""

import sys
import os
import json
import time
import random
import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from copy import deepcopy

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 导入现有的AI引擎
try:
    from board import board
    from board import common_20210815 as common
    
    # 导入 musesfish AI 引擎
    import musesfish_pvs_exp as musesfish
    from musesfish_pvs_exp import Position, Searcher, Entry, MATE_UPPER, MATE_LOWER
    
    AI_AVAILABLE = True
    print("AI engine loaded successfully")
except ImportError as e:
    print(f"Warning: Could not import AI engine: {e}")
    print("AI recommendations will not be available")
    musesfish = None
    AI_AVAILABLE = False

app = Flask(__name__)
CORS(app)

class WebJieqiAI:
    """Web版暗棋AI接口"""
    
    def __init__(self):
        self.board = board.Board() if board else None
        self.searcher = Searcher() if musesfish else None
        self.mapping = {}
        self.position_cache = {}
        self.initialize_ai()
        
    def initialize_ai(self):
        """初始化AI引擎"""
        if not self.board:
            return False
            
        try:
            # 重置全局变量
            musesfish.resetrbdict()
            self.mapping = self.board.translate_mapping(self.board.mapping)
            
            if self.searcher:
                self.searcher.calc_average()
            
            return True
        except Exception as e:
            print(f"AI initialization failed: {e}")
            return False
    
    def web_board_to_musesfish_board(self, web_board, current_player):
        """将Web棋盘格式转换为musesfish格式"""
        if not web_board:
            return musesfish.initial_covered
            
        # musesfish使用的棋盘字符串格式
        board_lines = []
        
        # 前3行填充空格
        for i in range(3):
            board_lines.append('               \n')
        
        # 转换实际棋盘 (web棋盘是10x9，musesfish需要16行)
        for row in range(9, -1, -1):  # musesfish棋盘是倒序的
            line = '   '  # 左边填充
            for col in range(9):
                piece = web_board[row][col]
                if piece == '.':
                    line += '.'
                else:
                    # 转换棋子符号
                    line += self.convert_piece_to_musesfish(piece)
            line += '   \n'  # 右边填充和换行
            board_lines.append(line)
        
        # 后3行填充空格
        for i in range(3):
            board_lines.append('               \n')
        
        # 最后一行不要换行
        if board_lines:
            board_lines[-1] = board_lines[-1].rstrip('\n') + ' '
        
        return ''.join(board_lines)
    
    def convert_piece_to_musesfish(self, piece):
        """转换棋子符号到musesfish格式"""
        conversion_map = {
            # 红方明子
            'R': 'R', 'N': 'N', 'B': 'B', 'A': 'A', 'K': 'K', 'C': 'C', 'P': 'P',
            # 黑方明子
            'r': 'r', 'n': 'n', 'b': 'b', 'a': 'a', 'k': 'k', 'c': 'c', 'p': 'p',
            # 红方暗子
            'D': 'D', 'E': 'E', 'F': 'F', 'G': 'G', 'H': 'H', 'I': 'I',
            # 黑方暗子
            'd': 'd', 'e': 'e', 'f': 'f', 'g': 'g', 'h': 'h', 'i': 'i'
        }
        return conversion_map.get(piece, '.')
    
    def musesfish_move_to_web_move(self, move_tuple):
        """将musesfish移动格式转换为web格式"""
        if not move_tuple or len(move_tuple) != 2:
            return None
            
        from_pos, to_pos = move_tuple
        
        # musesfish使用线性索引，需要转换为行列坐标
        def linear_to_rowcol(pos):
            # 根据musesfish的位置计算方式
            row = 12 - (pos // 16)
            col = (pos % 16) - 3
            return row, col
        
        from_row, from_col = linear_to_rowcol(from_pos)
        to_row, to_col = linear_to_rowcol(to_pos)
        
        return {
            'from': {'row': from_row, 'col': from_col},
            'to': {'row': to_row, 'col': to_col}
        }
    
    def get_ai_recommendation(self, web_board, current_player, history=None):
        """获取AI推荐走法"""
        if not AI_AVAILABLE or not musesfish or not self.searcher:
            return {
                'success': False,
                'error': 'AI engine not available'
            }
        
        try:
            # 分析历史中的被吃棋子信息（包括明子和暗子），更新AI的棋子统计
            captured_pieces = self.analyze_captured_pieces(history)
            self.update_ai_piece_knowledge(captured_pieces)
            
            # 保存棋子信息用于详情显示
            self._last_captured_info = captured_pieces
            
            # --- 使用 musesfish 引擎的反重复逻辑 ---
            # 1. 获取所有历史棋盘局面（从人类玩家的固定视角）
            all_web_boards = []
            if history:
                # history[i].boardStateAfter 是第 i 步完成后的棋盘状态
                all_web_boards = [h['boardStateAfter'] for h in history if 'boardStateAfter' in h]
            # 追加当前棋盘状态
            all_web_boards.append(web_board)

            # 2. 填充 musesfish 的全局 cache
            # cache 需要从人类（红方）的统一视角进行填充
            musesfish.cache.clear()
            for b in all_web_boards:
                # 统一转换成红方（人类玩家）视角的棋盘字符串
                musesfish_board_str = self.web_board_to_musesfish_board(b, 'red')
                musesfish.setcache(musesfish_board_str)

            # 3. 创建当前局面对象，供AI思考
            # 棋盘需要转换成当前玩家的视角，然后旋转成AI的标准视角（大写棋子在下方）
            musesfish_board = self.web_board_to_musesfish_board(web_board, current_player)
            turn = current_player == 'red'
            position = Position(musesfish_board, 0, turn, 0).set()
            if not turn:
                position = position.rotate()

            # 4. 调用 musesfish 引擎生成禁着
            # 这会使用全局的 cache，并更新全局的 forbidden_moves
            forbidden_moves = musesfish.generate_forbiddenmoves(position, current_player=current_player)
            # --- 逻辑修改结束 ---

            self._last_forbidden_count = len(forbidden_moves)
            self._forced_move_warning = False
            
            # AI 搜索引擎会隐式使用 musesfish.forbidden_moves 全局变量
            
            # 使用AI搜索
            start_time = time.time()
            best_move = None
            best_score = 0
            search_depth = 0
            fallback_move = None
            fallback_score = float('-inf')
            
            # searcher.search() 会使用 musesfish.forbidden_moves 来过滤
            for depth, move, score in self.searcher.search(position, ()):
                # 记录第一个可用走法作为后备
                if fallback_move is None:
                    fallback_move = move
                    fallback_score = score
                
                # 检查走法是否导致重复局面
                if move not in forbidden_moves:
                    best_move = move
                    best_score = score
                    search_depth = depth
                else:
                    # 如果是禁着但分数更好，作为备选
                    if score > fallback_score:
                        fallback_move = move
                        fallback_score = score
                
                # 时间控制：模仿命令行版本的THINK_TIME逻辑
                if time.time() - start_time > musesfish.THINK_TIME:
                    print(f"搜索达到时间限制({musesfish.THINK_TIME}秒)，在深度{depth}停止")
                    break
            
            # 计算实际搜索时间
            search_time = time.time() - start_time
            print(f"AI搜索完成: 深度={search_depth}, 分数={best_score}, 耗时={search_time:.3f}秒")
            
            # 如果没有找到非禁着的走法，使用后备走法
            if best_move is None and fallback_move is not None:
                best_move = fallback_move
                best_score = fallback_score
                search_depth = 1
                self._forced_move_warning = True
                print(f"警告: 所有走法都会导致重复局面，强制选择最佳禁着走法")
            
            # 如果是黑方回合，需要将AI返回的“红方”走法转换回黑方走法
            if not turn and best_move:
                best_move = (254 - best_move[0], 254 - best_move[1])

            if not best_move:
                return {
                    'success': False,
                    'error': 'No valid move found'
                }
            
            # 转换移动格式
            web_move = self.musesfish_move_to_web_move(best_move)
            if not web_move:
                return {
                    'success': False,
                    'error': 'Move conversion failed'
                }
            
            # 获取移动的棋子信息
            from_piece = web_board[web_move['from']['row']][web_move['from']['col']]
            to_piece = web_board[web_move['to']['row']][web_move['to']['col']]
            
            # 生成推荐详情
            details = []
            if to_piece != '.':
                details.append(f"吃掉对方的{self.get_piece_name(to_piece)}")
            
            # 添加AI棋子知识状态信息
            if hasattr(self, '_last_captured_info') and (self._last_captured_info['red'] or self._last_captured_info['black']):
                known_info = []
                if self._last_captured_info['red']:
                    red_pieces = [f"{self.get_piece_name(k)}×{v}" for k, v in self._last_captured_info['red'].items()]
                    known_info.append(f"红方被吃: {', '.join(red_pieces)}")
                if self._last_captured_info['black']:
                    black_pieces = [f"{self.get_piece_name(k)}×{v}" for k, v in self._last_captured_info['black'].items()]
                    known_info.append(f"黑方被吃: {', '.join(black_pieces)}")
                details.append(f"💡 AI已考虑被吃棋子信息: {'; '.join(known_info)}")
            
            # 添加反重复局面信息
            if hasattr(self, '_last_forbidden_count') and self._last_forbidden_count > 0:
                details.append(f"🚫 AI避免了 {self._last_forbidden_count} 个可能导致重复局面的走法")
            
            # 添加强制走法警告
            if hasattr(self, '_forced_move_warning') and self._forced_move_warning:
                details.append("⚠️ 警告: 所有走法都会重复局面，已选择最佳走法")
            
            # 添加开局库提示
            if hasattr(self.searcher, 'from_kaijuku') and self.searcher.from_kaijuku:
                details.append("📚 此步棋来自开局库，无需计算")
            
            if best_score > 500:
                details.append("这步棋有很大优势")
            elif best_score > 100:
                details.append("这步棋有一定优势")
            elif best_score > -100:
                details.append("局面基本平衡")
            else:
                details.append("需要小心防守")
            
            return {
                'success': True,
                'move': {
                    'from': web_move['from'],
                    'to': web_move['to'],
                    'piece': from_piece,
                    'capturedPiece': to_piece,
                    'isCapture': to_piece != '.'
                },
                'score': int(best_score),
                'depth': search_depth,
                'search_time': round(search_time, 3),
                'details': details
            }
            
        except Exception as e:
            print(f"AI recommendation error: {e}")
            return {
                'success': False,
                'error': f'AI error: {str(e)}'
            }
    
    def get_piece_name(self, piece):
        """获取棋子中文名称"""
        piece_names = {
            'R': '車', 'N': '馬', 'B': '相', 'A': '仕', 'K': '帥', 'C': '炮', 'P': '兵',
            'r': '車', 'n': '馬', 'b': '象', 'a': '士', 'k': '將', 'c': '炮', 'p': '卒',
            'D': '暗車', 'E': '暗馬', 'F': '暗相', 'G': '暗仕', 'H': '暗炮', 'I': '暗兵',
            'd': '暗車', 'e': '暗馬', 'f': '暗象', 'g': '暗士', 'h': '暗炮', 'i': '暗卒'
        }
        return piece_names.get(piece, '未知')
    
    def analyze_captured_pieces(self, history):
        """分析游戏历史中的被吃棋子信息（包括明子和暗子）"""
        captured_pieces = {'red': {}, 'black': {}}
        
        if not history:
            return captured_pieces
        
        for move in history:
            # 检查是否有被吃的棋子
            if move.get('capturedPiece') != '.':
                captured_piece = move.get('capturedPiece')
                real_type = move.get('capturedPieceRealType', captured_piece)  # 暗子用真实类型，明子用自身
                
                # 确定被吃棋子的阵营
                if captured_piece in 'DEFGHI' or real_type in 'RNBAKCP':  # 红方棋子被吃
                    side = 'red'
                elif captured_piece in 'defghi' or real_type in 'rnbakcp':  # 黑方棋子被吃
                    side = 'black'
                else:
                    continue  # 无法确定阵营，跳过
                
                # 记录被吃的棋子类型（统一使用真实类型）
                if real_type not in captured_pieces[side]:
                    captured_pieces[side][real_type] = 0
                captured_pieces[side][real_type] += 1
        
        return captured_pieces
    
    def update_ai_piece_knowledge(self, captured_pieces):
        """更新AI引擎的棋子统计信息（包括明子和暗子）"""
        if not musesfish:
            return
        
        try:
            # 重置di字典到初始状态
            musesfish.resetrbdict()
            
            # 根据已知的被吃棋子信息更新di字典
            for side, pieces in captured_pieces.items():
                for piece_type, count in pieces.items():
                    if side == 'red':
                        # 红方棋子被吃，减少红方对应棋子的统计
                        if piece_type in musesfish.di[0][True]:
                            musesfish.di[0][True][piece_type] = max(0, 
                                musesfish.di[0][True][piece_type] - count)
                    else:
                        # 黑方棋子被吃，减少黑方对应棋子的统计
                        if piece_type in musesfish.di[0][False]:
                            musesfish.di[0][False][piece_type] = max(0, 
                                musesfish.di[0][False][piece_type] - count)
            
            # 重新计算平均值
            if self.searcher:
                self.searcher.calc_average()
                
            print(f"AI棋子知识已更新: 红方被吃{captured_pieces['red']}, 黑方被吃{captured_pieces['black']}")
            
        except Exception as e:
            print(f"更新AI棋子知识失败: {e}")
    
    def get_initial_board(self):
        """获取初始棋盘状态，与musesfish的initial_covered布局匹配"""
        # 对应musesfish initial_covered的标准暗棋初始布局
        # musesfish棋盘行号3-12对应web棋盘行号0-9
        initial = [
            ['d', 'e', 'f', 'g', 'k', 'g', 'f', 'e', 'd'],  # 第3行：黑方底线
            ['.', '.', '.', '.', '.', '.', '.', '.', '.'],   # 第4行：空行
            ['.', 'h', '.', '.', '.', '.', '.', 'h', '.'],   # 第5行：黑炮
            ['i', '.', 'i', '.', 'i', '.', 'i', '.', 'i'],   # 第6行：黑兵
            ['.', '.', '.', '.', '.', '.', '.', '.', '.'],   # 第7行：空行
            ['.', '.', '.', '.', '.', '.', '.', '.', '.'],   # 第8行：空行
            ['I', '.', 'I', '.', 'I', '.', 'I', '.', 'I'],   # 第9行：红兵
            ['.', 'H', '.', '.', '.', '.', '.', 'H', '.'],   # 第10行：红炮
            ['.', '.', '.', '.', '.', '.', '.', '.', '.'],   # 第11行：空行
            ['D', 'E', 'F', 'G', 'K', 'G', 'F', 'E', 'D']   # 第12行：红方底线
        ]
        return [row[:] for row in initial]  # 深拷贝
    
    def evaluate_position(self, web_board, current_player):
        """评估当前局面"""
        try:
            if not AI_AVAILABLE or not musesfish:
                return {
                    'success': False,
                    'error': 'AI engine not available'
                }
            
            # 转换棋盘格式
            musesfish_board = self.web_board_to_musesfish_board(web_board, current_player)
            
            # 创建Position对象
            turn = current_player == 'red'
            position = Position(musesfish_board, 0, turn, 0).set()
            
            # 如果是黑方回合，需要旋转棋盘
            if not turn:
                position = position.rotate()
            
            # 获取局面评估分数
            score_rough = position.score_rough
            
            # 计算各项指标
            material_balance = self.calculate_material_balance(position)
            mobility_factor = self.calculate_mobility_factor(position)
            control_evaluation = self.calculate_control_evaluation(position)
            
            # 生成评估结果
            evaluation_text = self.generate_evaluation_text(score_rough, material_balance)
            
            return {
                'success': True,
                'score': int(score_rough),
                'evaluation': evaluation_text,
                'details': {
                    'material_balance': material_balance,
                    'mobility_factor': mobility_factor,
                    'control_evaluation': control_evaluation,
                    'raw_score': int(score_rough)
                },
                'advantage': self.get_advantage_level(score_rough)
            }
            
        except Exception as e:
            print(f"Position evaluation error: {e}")
            return {
                'success': False,
                'error': f'Evaluation failed: {str(e)}'
            }
    
    def calculate_material_balance(self, position):
        """计算子力平衡"""
        try:
            red_material = 0
            black_material = 0
            
            piece_values = {'R': 9, 'N': 5, 'B': 3, 'A': 2, 'C': 5, 'P': 1, 'K': 100}
            
            for i in range(51, 204):
                piece = position.board[i]
                if piece in piece_values:
                    red_material += piece_values[piece]
                elif piece.upper() in piece_values:
                    black_material += piece_values[piece.upper()]
            
            return {
                'red_material': red_material,
                'black_material': black_material,
                'balance': red_material - black_material
            }
        except:
            return {'red_material': 0, 'black_material': 0, 'balance': 0}
    
    def calculate_mobility_factor(self, position):
        """计算机动性因子"""
        try:
            moves = list(position.gen_moves())
            return {
                'available_moves': len(moves),
                'mobility_score': min(len(moves), 20) * 5  # 最多100分
            }
        except:
            return {'available_moves': 0, 'mobility_score': 0}
    
    def calculate_control_evaluation(self, position):
        """计算控制力评估"""
        try:
            center_control = 0
            edge_control = 0
            
            # 简化的控制力评估
            for i in range(51, 204):
                piece = position.board[i]
                if piece != '.' and piece.isupper():
                    # 检查是否在中心区域
                    row = i // 16
                    col = i % 16
                    if 6 <= row <= 9 and 5 <= col <= 10:
                        center_control += 1
                    else:
                        edge_control += 1
            
            return {
                'center_control': center_control,
                'edge_control': edge_control,
                'total_control': center_control + edge_control
            }
        except:
            return {'center_control': 0, 'edge_control': 0, 'total_control': 0}
    
    def generate_evaluation_text(self, score, material_balance):
        """生成评估文本"""
        if score > 500:
            return "红方具有压倒性优势"
        elif score > 200:
            return "红方具有明显优势"
        elif score > 50:
            return "红方略有优势"
        elif score > -50:
            return "局面基本平衡"
        elif score > -200:
            return "黑方略有优势"
        elif score > -500:
            return "黑方具有明显优势"
        else:
            return "黑方具有压倒性优势"
    
    def get_advantage_level(self, score):
        """获取优势等级"""
        if score > 500:
            return {'level': 'overwhelming', 'side': 'red', 'percentage': 90}
        elif score > 200:
            return {'level': 'significant', 'side': 'red', 'percentage': 75}
        elif score > 50:
            return {'level': 'slight', 'side': 'red', 'percentage': 60}
        elif score > -50:
            return {'level': 'balanced', 'side': 'none', 'percentage': 50}
        elif score > -200:
            return {'level': 'slight', 'side': 'black', 'percentage': 40}
        elif score > -500:
            return {'level': 'significant', 'side': 'black', 'percentage': 25}
        else:
            return {'level': 'overwhelming', 'side': 'black', 'percentage': 10}

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
        
        # 获取AI推荐（传递游戏历史以利用被吃暗子信息）
        recommendation = ai_engine.get_ai_recommendation(web_board, current_player, history)
        
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

@app.route('/api/validate-move', methods=['POST'])
def validate_move():
    """验证移动合法性"""
    try:
        data = request.get_json()
        
        web_board = data.get('board')
        move = data.get('move')
        current_player = data.get('currentPlayer', 'red')
        
        if not web_board or not move:
            return jsonify({
                'valid': False,
                'error': 'Board and move data required'
            })
        
        # 这里可以添加更复杂的移动验证逻辑
        # 暂时返回基本验证
        from_row = move['from']['row']
        from_col = move['from']['col']
        to_row = move['to']['row']
        to_col = move['to']['col']
        
        # 基本边界检查
        if (from_row < 0 or from_row >= 10 or from_col < 0 or from_col >= 9 or
            to_row < 0 or to_row >= 10 or to_col < 0 or to_col >= 9):
            return jsonify({
                'valid': False,
                'error': 'Move out of board bounds'
            })
        
        return jsonify({
            'valid': True
        })
        
    except Exception as e:
        return jsonify({
            'valid': False,
            'error': f'Validation error: {str(e)}'
        })

@app.route('/api/specify-captured-dark-piece', methods=['POST'])
def specify_captured_dark_piece():
    """指定被吃暗子的真实类型"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        dark_piece = data.get('darkPiece')  # 原始暗子符号 (如 'D', 'e' 等)
        real_type = data.get('realType')   # 真实类型 (如 'R', 'n' 等)
        
        if not dark_piece or not real_type:
            return jsonify({
                'success': False,
                'error': 'darkPiece and realType are required'
            }), 400
        
        # 验证暗子符号和真实类型的合法性
        if not re.match(r'^[DEFGHIdefghi]$', dark_piece):
            return jsonify({
                'success': False,
                'error': 'Invalid dark piece symbol'
            }), 400
        
        if not re.match(r'^[RNBAKCPrnbakcp]$', real_type):
            return jsonify({
                'success': False,
                'error': 'Invalid real piece type'
            }), 400
        
        # 验证颜色匹配（红方暗子对应红方棋子，黑方暗子对应黑方棋子）
        is_red_dark = dark_piece in 'DEFGHI'
        is_red_real = real_type in 'RNBAKCP'
        
        if is_red_dark != is_red_real:
            return jsonify({
                'success': False,
                'error': 'Dark piece color must match real piece color'
            }), 400
        
        # 记录被吃暗子的类型映射（可以用于后续的AI决策）
        piece_mapping = {
            'darkPiece': dark_piece,
            'realType': real_type,
            'timestamp': time.time()
        }
        
        return jsonify({
            'success': True,
            'mapping': piece_mapping,
            'message': f'被吃暗子已确认为{ai_engine.get_piece_name(real_type)}'
        })
        
    except Exception as e:
        print(f"Specify captured dark piece error: {e}")
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
        
        if not web_board:
            return jsonify({
                'success': False,
                'error': 'Board data required'
            }), 400
        
        # 获取局面评估
        evaluation = ai_engine.evaluate_position(web_board, current_player)
        
        return jsonify(evaluation)
        
    except Exception as e:
        print(f"Position evaluation error: {e}")
        return jsonify({
            'success': False,
            'error': f'Evaluation error: {str(e)}'
        }), 500

@app.route('/api/game-status', methods=['GET'])
def game_status():
    """获取游戏状态"""
    return jsonify({
        'ai_available': AI_AVAILABLE,
        'server_time': time.time(),
        'version': '1.0.0'
    })

if __name__ == '__main__':
    print("Starting Jieqi Web Server...")
    print(f"AI Engine Available: {AI_AVAILABLE}")
    
    # 在开发模式下运行
    app.run(host='0.0.0.0', port=8000, debug=True)
