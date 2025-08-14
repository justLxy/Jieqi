/**
 * 中国暗棋（揭棋）Web版游戏引擎
 * 实现完整的暗棋游戏逻辑和AI交互
 */

class JieqiGame {
    constructor() {
        this.initializeGame();
        this.initializeUI();
        this.setupEventListeners();
        
        // 初始化AI状态检查
        this.checkAIStatus();
        
        // 定期检查AI状态
        setInterval(() => this.checkAIStatus(), 30000); // 每30秒检查一次
    }

    initializeGame() {
        // 游戏状态
        this.gameState = {
            board: this.createInitialBoard(),
            currentPlayer: 'red', // 'red' or 'black'
            selectedSquare: null,
            gameHistory: [],
            currentMoveIndex: -1,
            isGameOver: false,
            winner: null
        };

        // 棋盘方向 (false: 红方在下, true: 红方在上)
        this.boardFlipped = false;

        // 被吃的棋子
        this.capturedPieces = {
            red: [],
            black: []
        };

        // AI推荐
        this.aiRecommendation = null;

        // AI开关状态
        this.aiToggles = {
            red: false,
            black: false
        };

        // 最后一步棋
        this.lastMove = null;

        // 棋子类型映射
        this.pieceNames = {
            'R': '車', 'N': '馬', 'B': '相', 'A': '仕', 'K': '帥', 'C': '炮', 'P': '兵',
            'r': '車', 'n': '馬', 'b': '象', 'a': '士', 'k': '將', 'c': '炮', 'p': '卒',
            'D': '暗', 'E': '暗', 'F': '暗', 'G': '暗', 'H': '暗', 'I': '暗',
            'd': '暗', 'e': '暗', 'f': '暗', 'g': '暗', 'h': '暗', 'i': '暗'
        };

        // 棋子数量限制（按照传统象棋规则）
        this.pieceLimits = {
            // 红方棋子限制
            'R': 2, 'N': 2, 'B': 2, 'A': 2, 'K': 1, 'C': 2, 'P': 5,
            // 黑方棋子限制
            'r': 2, 'n': 2, 'b': 2, 'a': 2, 'k': 1, 'c': 2, 'p': 5
        };


        
        // 等待暗子选择的状态
        this.pendingDarkPieceSelection = null;
    }

    createInitialBoard() {
        // 创建初始棋盘布局 (10x9)
        const board = Array(10).fill(null).map(() => Array(9).fill('.'));
        
        // 红方 (下方，索引0-4)
        // 帅和将是明子，其他都是暗子
        board[0] = ['D', 'E', 'F', 'G', 'K', 'G', 'F', 'E', 'D']; // 第0行
        board[1] = ['.', '.', '.', '.', '.', '.', '.', '.', '.']; // 第1行
        board[2] = ['.', 'H', '.', '.', '.', '.', '.', 'H', '.']; // 第2行
        board[3] = ['I', '.', 'I', '.', 'I', '.', 'I', '.', 'I']; // 第3行

        // 中间空行
        board[4] = ['.', '.', '.', '.', '.', '.', '.', '.', '.'];
        board[5] = ['.', '.', '.', '.', '.', '.', '.', '.', '.'];

        // 黑方 (上方，索引6-9)
        board[6] = ['i', '.', 'i', '.', 'i', '.', 'i', '.', 'i']; // 第6行
        board[7] = ['.', 'h', '.', '.', '.', '.', '.', 'h', '.']; // 第7行
        board[8] = ['.', '.', '.', '.', '.', '.', '.', '.', '.']; // 第8行
        board[9] = ['d', 'e', 'f', 'g', 'k', 'g', 'f', 'e', 'd']; // 第9行

        return board;
    }

    initializeUI() {
        this.boardElement = document.getElementById('chessBoard');
        this.currentTurnElement = document.getElementById('currentTurn');
        this.redCapturedElement = document.getElementById('redCaptured');
        this.blackCapturedElement = document.getElementById('blackCaptured');
        this.historyListElement = document.getElementById('historyList');
        this.aiRecommendationElement = document.getElementById('aiRecommendation');

        this.messageAreaElement = document.getElementById('messageArea');

        this.createBoard();
        this.updateDisplay();
    }

    createBoard() {
        this.boardElement.innerHTML = '';
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const square = document.createElement('div');
                square.className = 'chess-square';
                square.dataset.row = row;
                square.dataset.col = col;
                
                // 添加点击事件
                square.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleSquareClick(row, col, e);
                });
                
                this.boardElement.appendChild(square);
            }
        }
        
        console.log('棋盘创建完成，共创建了', this.boardElement.children.length, '个格子');
    }

    updateDisplay() {
        this.updateBoard();
        this.updateCurrentPlayer();
        this.updateCapturedPieces();
        this.updateHistory();
    }

    updateBoard() {
        const squares = this.boardElement.querySelectorAll('.chess-square');
        
        squares.forEach((square, index) => {
            const row = Math.floor(index / 9);
            const col = index % 9;
            const displayRow = this.boardFlipped ? 9 - row : row;
            const displayCol = this.boardFlipped ? 8 - col : col;
            
            const piece = this.gameState.board[displayRow][displayCol];
            
            // 清除之前的内容和样式
            square.innerHTML = '';
            square.className = 'chess-square';
            
            // 添加坐标
            square.dataset.row = displayRow;
            square.dataset.col = displayCol;
            
            // 如果有棋子，创建棋子元素
            if (piece !== '.') {
                const pieceElement = this.createPieceElement(piece, displayRow, displayCol);
                square.appendChild(pieceElement);
            }
            
            // 添加高亮样式
            if (this.gameState.selectedSquare && 
                this.gameState.selectedSquare.row === displayRow && 
                this.gameState.selectedSquare.col === displayCol) {
                square.classList.add('selected');
            }
            
            // 添加上一步移动的标记
            if (this.lastMove) {
                if (this.lastMove.from.row === displayRow && this.lastMove.from.col === displayCol) {
                    square.classList.add('last-move-from');
                }
                if (this.lastMove.to.row === displayRow && this.lastMove.to.col === displayCol) {
                    square.classList.add('last-move-to');
                }
            }
        });
    }

    createPieceElement(piece, row, col) {
        const pieceElement = document.createElement('div');
        pieceElement.className = 'chess-piece';
        
        // 确定棋子颜色和类型
        if (piece.match(/[RNBAKCP]/)) {
            pieceElement.classList.add('red');
        } else if (piece.match(/[rnbakcp]/)) {
            pieceElement.classList.add('black');
        } else if (piece.match(/[DEFGHI]/)) {
            // 红方暗棋（大写字母）
            pieceElement.classList.add('dark-red');
        } else if (piece.match(/[defghi]/)) {
            // 黑方暗棋（小写字母）
            pieceElement.classList.add('dark-black');
        } else {
            // 备用：未知类型的暗棋
            pieceElement.classList.add('dark');
        }
        
        // 设置棋子文字
        pieceElement.textContent = this.pieceNames[piece] || '暗';
        

        
        return pieceElement;
    }

    handleSquareClick(row, col, event) {
        console.log(`点击了显示坐标 (${row}, ${col})`);
        
        // 如果正在等待暗子选择，阻止棋盘操作
        if (this.pendingDarkPieceSelection) {
            this.showMessage('请先在右侧选择暗子类型', 'warning');
            return;
        }
        
        // 将显示坐标转换为逻辑坐标
        const logicRow = this.boardFlipped ? 9 - row : row;
        const logicCol = this.boardFlipped ? 8 - col : col;
        console.log(`转换为逻辑坐标 (${logicRow}, ${logicCol})`);
        
        const piece = this.gameState.board[logicRow][logicCol];
        console.log(`格子上的棋子: ${piece}`);
        
        // 如果当前没有选中棋子
        if (!this.gameState.selectedSquare) {
            if (piece !== '.' && this.isPieceOwnedByCurrentPlayer(piece)) {
                console.log('选择棋子:', piece);
                this.selectSquare(logicRow, logicCol);
            } else if (piece !== '.') {
                this.showMessage('不能选择对方的棋子', 'warning');
            } else {
                this.showMessage('请选择一个棋子', 'info');
            }
        } else {
            // 如果点击的是同一个位置，取消选择
            if (this.gameState.selectedSquare.row === logicRow && this.gameState.selectedSquare.col === logicCol) {
                console.log('取消选择');
                this.deselectSquare();
            } else {
                // 尝试移动棋子
                console.log(`尝试移动从 (${this.gameState.selectedSquare.row}, ${this.gameState.selectedSquare.col}) 到 (${logicRow}, ${logicCol})`);
                this.attemptMove(this.gameState.selectedSquare.row, this.gameState.selectedSquare.col, logicRow, logicCol);
            }
        }
    }

    selectSquare(row, col) {
        this.gameState.selectedSquare = { row, col };
        this.highlightPossibleMoves(row, col);
        this.updateBoard();
    }

    deselectSquare() {
        this.gameState.selectedSquare = null;
        this.clearHighlights();
        this.updateBoard();
    }

    highlightPossibleMoves(row, col) {
        // 清除之前的高亮
        this.clearHighlights();
        
        const piece = this.gameState.board[row][col];
        const possibleMoves = this.getPossibleMoves(row, col, piece);
        
        possibleMoves.forEach(move => {
            const square = this.getSquareElement(move.row, move.col);
            if (square) {
                if (move.isCapture) {
                    square.classList.add('capturable');
                } else {
                    square.classList.add('movable');
                }
            }
        });
    }

    clearHighlights() {
        const squares = this.boardElement.querySelectorAll('.chess-square');
        squares.forEach(square => {
            square.classList.remove('movable', 'capturable', 'highlighted');
        });
    }

    getPossibleMoves(row, col, piece) {
        const moves = [];
        const pieceType = piece.toLowerCase();
        
        // 根据棋子类型计算可能的移动
        switch (pieceType) {
            case 'r':
            case 'd': // 暗车按车的规则走
                moves.push(...this.getRookMoves(row, col));
                break;
            case 'n':
            case 'e': // 暗马按马的规则走
                moves.push(...this.getKnightMoves(row, col));
                break;
            case 'b':
            case 'f': // 暗相按相的规则走
                moves.push(...this.getBishopMoves(row, col));
                break;
            case 'a':
            case 'g': // 暗士按士的规则走
                moves.push(...this.getAdvisorMoves(row, col));
                break;
            case 'k': // 帅/将
                moves.push(...this.getKingMoves(row, col));
                break;
            case 'c':
            case 'h': // 暗炮按炮的规则走
                moves.push(...this.getCannonMoves(row, col));
                break;
            case 'p':
            case 'i': // 暗兵按兵的规则走
                moves.push(...this.getPawnMoves(row, col));
                break;
        }
        
        // 过滤掉不合法的移动
        return moves.filter(move => this.isValidMove(row, col, move.row, move.col));
    }

    // 车的移动规则
    getRookMoves(row, col) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < 10; i++) {
                const newRow = row + dr * i;
                const newCol = col + dc * i;
                
                if (!this.isValidPosition(newRow, newCol)) break;
                
                const targetPiece = this.gameState.board[newRow][newCol];
                if (targetPiece === '.') {
                    moves.push({ row: newRow, col: newCol, isCapture: false });
                } else {
                    if (!this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                        moves.push({ row: newRow, col: newCol, isCapture: true });
                    }
                    break;
                }
            }
        });
        
        return moves;
    }

    // 马的移动规则
    getKnightMoves(row, col) {
        const moves = [];
        const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        
        knightMoves.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (!this.isValidPosition(newRow, newCol)) return;
            
            // 检查蹩马腿
            let blockRow, blockCol;
            if (Math.abs(dr) === 2) {
                blockRow = row + dr / 2;
                blockCol = col;
            } else {
                blockRow = row;
                blockCol = col + dc / 2;
            }
            
            if (this.gameState.board[blockRow][blockCol] !== '.') return;
            
            const targetPiece = this.gameState.board[newRow][newCol];
            if (targetPiece === '.' || !this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                moves.push({ row: newRow, col: newCol, isCapture: targetPiece !== '.' });
            }
        });
        
        return moves;
    }

    // 相/象的移动规则
    getBishopMoves(row, col) {
        const moves = [];
        const bishopMoves = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
        
        bishopMoves.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (!this.isValidPosition(newRow, newCol)) return;
            
            // 检查塞象眼
            const blockRow = row + dr / 2;
            const blockCol = col + dc / 2;
            if (this.gameState.board[blockRow][blockCol] !== '.') return;
            
            const targetPiece = this.gameState.board[newRow][newCol];
            if (targetPiece === '.' || !this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                moves.push({ row: newRow, col: newCol, isCapture: targetPiece !== '.' });
            }
        });
        
        return moves;
    }

    // 士的移动规则
    getAdvisorMoves(row, col) {
        const moves = [];
        const advisorMoves = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        
        advisorMoves.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (!this.isValidPosition(newRow, newCol)) return;
            
            const targetPiece = this.gameState.board[newRow][newCol];
            if (targetPiece === '.' || !this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                moves.push({ row: newRow, col: newCol, isCapture: targetPiece !== '.' });
            }
        });
        
        return moves;
    }

    // 帅/将的移动规则
    getKingMoves(row, col) {
        const moves = [];
        const kingMoves = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        // 常规移动：一格移动
        kingMoves.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (!this.isValidPosition(newRow, newCol)) return;
            
            // 帅/将只能在九宫内移动
            if (!this.isInPalace(newRow, newCol)) return;
            
            const targetPiece = this.gameState.board[newRow][newCol];
            if (targetPiece === '.' || !this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                moves.push({ row: newRow, col: newCol, isCapture: targetPiece !== '.' });
            }
        });
        
        // 特殊移动：帅将跳杀
        const jumpKillMove = this.getKingJumpKillMove(row, col);
        if (jumpKillMove) {
            moves.push(jumpKillMove);
        }
        
        return moves;
    }
    
    // 帅将跳杀规则：当帅和将在同一直线上且中间无子时，可以跳杀对方
    getKingJumpKillMove(row, col) {
        const currentPiece = this.gameState.board[row][col];
        const isCurrentRed = currentPiece === 'K';
        const targetPieceType = isCurrentRed ? 'k' : 'K'; // 要寻找的对方帅/将
        
        // 查找对方的帅/将位置
        let enemyKingPos = null;
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                if (this.gameState.board[r][c] === targetPieceType) {
                    enemyKingPos = { row: r, col: c };
                    break;
                }
            }
            if (enemyKingPos) break;
        }
        
        if (!enemyKingPos) return null; // 对方帅/将不存在
        
        // 检查是否在同一行或同一列
        const sameRow = row === enemyKingPos.row;
        const sameCol = col === enemyKingPos.col;
        
        if (!sameRow && !sameCol) return null; // 不在同一直线上
        
        // 检查中间是否有棋子阻挡
        if (sameRow) {
            // 同一行，检查列方向
            const startCol = Math.min(col, enemyKingPos.col);
            const endCol = Math.max(col, enemyKingPos.col);
            
            // 检查中间是否有棋子
            for (let c = startCol + 1; c < endCol; c++) {
                if (this.gameState.board[row][c] !== '.') {
                    return null; // 中间有棋子阻挡
                }
            }
        } else if (sameCol) {
            // 同一列，检查行方向
            const startRow = Math.min(row, enemyKingPos.row);
            const endRow = Math.max(row, enemyKingPos.row);
            
            // 检查中间是否有棋子
            for (let r = startRow + 1; r < endRow; r++) {
                if (this.gameState.board[r][col] !== '.') {
                    return null; // 中间有棋子阻挡
                }
            }
        }
        
        // 可以跳杀，返回移动到对方位置的走法
        return {
            row: enemyKingPos.row,
            col: enemyKingPos.col,
            isCapture: true
        };
    }

    // 炮的移动规则
    getCannonMoves(row, col) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        
        directions.forEach(([dr, dc]) => {
            let jumpedPiece = false;
            
            for (let i = 1; i < 10; i++) {
                const newRow = row + dr * i;
                const newCol = col + dc * i;
                
                if (!this.isValidPosition(newRow, newCol)) break;
                
                const targetPiece = this.gameState.board[newRow][newCol];
                
                if (!jumpedPiece) {
                    if (targetPiece === '.') {
                        moves.push({ row: newRow, col: newCol, isCapture: false });
                    } else {
                        jumpedPiece = true;
                    }
                } else {
                    if (targetPiece !== '.') {
                        if (!this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                            moves.push({ row: newRow, col: newCol, isCapture: true });
                        }
                        break;
                    }
                }
            }
        });
        
        return moves;
    }

    // 兵/卒的移动规则
    getPawnMoves(row, col) {
        const moves = [];
        const isRed = this.isPieceOwnedByCurrentPlayer(this.gameState.board[row][col]) && this.gameState.currentPlayer === 'red';
        
        // 向前移动
        const forwardDir = isRed ? 1 : -1;
        const newRow = row + forwardDir;
        
        if (this.isValidPosition(newRow, col)) {
            const targetPiece = this.gameState.board[newRow][col];
            if (targetPiece === '.' || !this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                moves.push({ row: newRow, col, isCapture: targetPiece !== '.' });
            }
        }
        
        // 过河后可以横向移动
        const hasRiverCrossed = (isRed && row > 4) || (!isRed && row < 5);
        if (hasRiverCrossed) {
            // 左右移动
            [col - 1, col + 1].forEach(newCol => {
                if (this.isValidPosition(row, newCol)) {
                    const targetPiece = this.gameState.board[row][newCol];
                    if (targetPiece === '.' || !this.isPieceOwnedByCurrentPlayer(targetPiece)) {
                        moves.push({ row, col: newCol, isCapture: targetPiece !== '.' });
                    }
                }
            });
        }
        
        return moves;
    }

    // 辅助方法
    isValidPosition(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 9;
    }

    isInPalace(row, col) {
        return (row >= 0 && row <= 2 && col >= 3 && col <= 5) || // 红方九宫
               (row >= 7 && row <= 9 && col >= 3 && col <= 5);   // 黑方九宫
    }

    isPieceOwnedByCurrentPlayer(piece) {
        if (piece === '.') return false;
        const isRedPiece = piece.match(/[RNBAKCPDEFGHI]/);
        return (this.gameState.currentPlayer === 'red' && isRedPiece) ||
               (this.gameState.currentPlayer === 'black' && !isRedPiece);
    }

    isValidMove(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidPosition(toRow, toCol)) return false;
        
        const fromPiece = this.gameState.board[fromRow][fromCol];
        const toPiece = this.gameState.board[toRow][toCol];
        
        // 不能吃自己的棋子
        if (toPiece !== '.' && this.isPieceOwnedByCurrentPlayer(toPiece)) return false;
        
        return true;
    }

    attemptMove(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidMove(fromRow, fromCol, toRow, toCol)) {
            this.showMessage('这步棋不合法！', 'error');
            return false;
        }

        const fromPiece = this.gameState.board[fromRow][fromCol];
        const toPiece = this.gameState.board[toRow][toCol];
        
        // 检查是否为合法移动
        const possibleMoves = this.getPossibleMoves(fromRow, fromCol, fromPiece);
        const isValidMove = possibleMoves.some(move => move.row === toRow && move.col === toCol);
        
        if (!isValidMove) {
            this.showMessage('这步棋不符合棋子的移动规则！', 'error');
            return false;
        }

        // 执行移动
        this.executeMove(fromRow, fromCol, toRow, toCol);
        return true;
    }

    executeMove(fromRow, fromCol, toRow, toCol) {
        const fromPiece = this.gameState.board[fromRow][fromCol];
        const toPiece = this.gameState.board[toRow][toCol];

        // 清除当前位置之后的历史
        this.gameState.gameHistory = this.gameState.gameHistory.slice(0, this.gameState.currentMoveIndex + 1);

        // 创建移动对象
        const move = {
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            piece: fromPiece,
            capturedPiece: toPiece,
            player: this.gameState.currentPlayer,
            // boardStateAfter 将在 completeMoveExecution 中添加
        };

        // 处理吃子
        if (toPiece !== '.') {
            // 检查被吃掉的棋子是否为暗子
            if (toPiece.match(/[DEFGHIdefghi]/)) {
                // 判断是否是玩家吃掉对手的暗子（只有这种情况下才能指定类型）
                const canSpecifyType = this.canPlayerSpecifyDarkPieceType(toPiece, this.gameState.currentPlayer);
                
                if (canSpecifyType) {
                    // 界面下方（玩家）吃掉了上方（对手）的暗子，可以指定其真实类型
                    this.pendingCapturedDarkPiece = {
                        darkPiece: toPiece,
                        capturedByPlayer: this.gameState.currentPlayer,
                        move: move
                    };
                    
                    // 先移动棋子
                    this.gameState.board[toRow][toCol] = fromPiece;
                    this.gameState.board[fromRow][fromCol] = '.';
                    
                    // 显示被吃暗子类型选择器
                    this.showCapturedDarkPieceSelector(toPiece, move);
                    return; // 暂停执行，等待用户选择被吃暗子的类型
                } else {
                    // 界面上方（对手）吃掉了下方（玩家）的暗子，玩家不知道对手看到什么，直接以暗子符号记录
                    if (this.gameState.currentPlayer === 'red') {
                        this.capturedPieces.black.push(toPiece); // 红方吃黑子
                    } else {
                        this.capturedPieces.red.push(toPiece); // 黑方吃红子
                    }
                }
            } else {
                // 明子被吃掉，直接添加到被吃棋子列表
                if (this.gameState.currentPlayer === 'red') {
                    this.capturedPieces.black.push(toPiece); // 红方吃黑子
                } else {
                    this.capturedPieces.red.push(toPiece); // 黑方吃红子
                }
            }
        }

        // 移动棋子（如果没有被吃暗子的情况已经处理过）
        if (!this.pendingCapturedDarkPiece) {
            this.gameState.board[toRow][toCol] = fromPiece;
            this.gameState.board[fromRow][fromCol] = '.';
        }

        // 暗子翻开逻辑：暗子移动后需要用户选择真实身份
        if (fromPiece.match(/[DEFGHIdefghi]/)) {
            // 暂停游戏流程，让用户选择暗子类型
            // 注意：此时还不更新游戏历史，等待用户选择后再更新
            this.showDarkPieceSelector(toRow, toCol, fromPiece, move);
            return; // 暂停执行，等待用户选择
        }

        // 完成移动流程
        this.completeMoveExecution(move);
    }

    showDarkPieceSelector(row, col, darkPiece, move) {
        // 在右侧面板显示暗子类型选择器，而不是弹窗
        const isRed = darkPiece.match(/[DEFGHI]/);
        
        // 存储当前选择状态
        this.pendingDarkPieceSelection = {
            row: row,
            col: col,
            darkPiece: darkPiece,
            move: move
        };
        
        // 在右侧面板中显示选择器
        const rightPanel = document.querySelector('.right-panel');
        
        // 移除可能存在的旧选择器
        const existingSelector = rightPanel.querySelector('.panel-dark-piece-selector');
        if (existingSelector) {
            existingSelector.remove();
        }
        
        // 获取可用的棋子选项
        const availableOptions = this.getAvailablePieceOptions(isRed);
        
        // 生成棋子按钮HTML
        const pieceButtonsHTML = availableOptions.map(option => {
            const disabledClass = option.isDisabled ? 'disabled' : '';
            const disabledAttr = option.isDisabled ? 'disabled' : '';
            const title = option.isDisabled 
                ? `该棋子数量已达上限 (${option.currentCount}/${option.maxCount})`
                : `当前数量: ${option.currentCount}/${option.maxCount}`;
            
            return `<button class="piece-btn piece-select-btn ${disabledClass}" 
                            data-piece="${option.type}" 
                            title="${title}" 
                            ${disabledAttr}>
                        ${option.name}
                        <small class="piece-count">${option.currentCount}/${option.maxCount}</small>
                    </button>`;
        }).join('');
        
        // 创建新的选择器
        const selectorDiv = document.createElement('div');
        selectorDiv.className = 'panel-dark-piece-selector';
        selectorDiv.innerHTML = `
            <h4>🔥 暗子必须翻开！</h4>
            <div class="piece-type-notice">
                您的暗子已移动到位置 (${row}, ${col})<br/>
                请选择它的真实身份：
            </div>
            <div class="piece-type-group">
                <h5>${isRed ? '红方棋子:' : '黑方棋子:'}</h5>
                <div class="piece-buttons ${isRed ? 'red-pieces' : 'black-pieces'}">
                    ${pieceButtonsHTML}
                </div>
            </div>
            <p style="text-align: center; font-size: 12px; color: #856404; margin-top: 10px;">
                <small>根据暗棋规则，暗子移动后必须翻开</small>
            </p>
        `;
        
        // 插入到AI信息的前面
        const aiInfo = rightPanel.querySelector('.ai-info');
        rightPanel.insertBefore(selectorDiv, aiInfo);
        
        // 添加选择事件
        const selectorButtons = selectorDiv.querySelectorAll('.piece-select-btn:not(.disabled)');
        selectorButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedPiece = btn.dataset.piece;
                if (this.completeDarkPieceSelection(row, col, selectedPiece, move)) {
                    selectorDiv.remove(); // 成功后移除选择器
                }
            });
        });
        
        // 滚动到选择器位置，确保用户能看到
        selectorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 显示提示消息
        this.showMessage(`暗子已移动到 (${row}, ${col})，请在右侧选择棋子类型`, 'warning');
    }

    showCapturedDarkPieceSelector(capturedDarkPiece, move) {
        // 在右侧面板显示被吃暗子类型选择器
        const isRed = capturedDarkPiece.match(/[DEFGHI]/);
        const capturedByPlayer = this.gameState.currentPlayer;
        
        const rightPanel = document.querySelector('.right-panel');
        
        // 移除可能存在的旧选择器
        const existingSelector = rightPanel.querySelector('.panel-captured-dark-piece-selector');
        if (existingSelector) {
            existingSelector.remove();
        }
        
        // 获取可用的棋子选项
        const availableOptions = this.getAvailablePieceOptions(isRed);
        
        // 生成棋子按钮HTML
        const pieceButtonsHTML = availableOptions.map(option => {
            const disabledClass = option.isDisabled ? 'disabled' : '';
            const disabledAttr = option.isDisabled ? 'disabled' : '';
            const title = option.isDisabled 
                ? `该棋子数量已达上限 (${option.currentCount}/${option.maxCount})`
                : `当前数量: ${option.currentCount}/${option.maxCount}`;
            
            return `<button class="piece-btn captured-piece-select-btn ${disabledClass}" 
                            data-piece="${option.type}" 
                            title="${title}" 
                            ${disabledAttr}>
                        ${option.name}
                        <small class="piece-count">${option.currentCount}/${option.maxCount}</small>
                    </button>`;
        }).join('');
        
        // 创建新的选择器
        const selectorDiv = document.createElement('div');
        selectorDiv.className = 'panel-captured-dark-piece-selector';
        selectorDiv.innerHTML = `
            <h4>🍽️ 您吃掉了对手的暗子！</h4>
            <div class="piece-type-notice">
                ${capturedByPlayer === 'red' ? '红方' : '黑方'}（您）吃掉了对手的暗子<br/>
                根据揭棋规则，您可以知道被吃暗子的真实身份<br/>
                请选择被吃掉的暗子类型：
            </div>
            <div class="piece-type-group">
                <h5>被吃的${isRed ? '红方' : '黑方'}棋子:</h5>
                <div class="piece-buttons ${isRed ? 'red-pieces' : 'black-pieces'}">
                    ${pieceButtonsHTML}
                </div>
            </div>
            <p style="text-align: center; font-size: 12px; color: #856404; margin-top: 10px;">
                <small>根据揭棋规则，吃掉暗子后可以知道其真实身份</small>
            </p>
        `;
        
        // 插入到AI信息的前面
        const aiInfo = rightPanel.querySelector('.ai-info');
        rightPanel.insertBefore(selectorDiv, aiInfo);
        
        // 添加选择事件
        const selectorButtons = selectorDiv.querySelectorAll('.captured-piece-select-btn:not(.disabled)');
        selectorButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedPiece = btn.dataset.piece;
                if (this.completeCapturedDarkPieceSelection(selectedPiece)) {
                    selectorDiv.remove(); // 成功后移除选择器
                }
            });
        });
        
        // 滚动到选择器位置，确保用户能看到
        selectorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 显示提示消息
        this.showMessage(`您吃掉了对手的暗子，请在右侧选择其真实类型`, 'warning');
    }

    // AI移动验证
    async validateMoveWithAI(fromRow, fromCol, toRow, toCol) {
        try {
            const response = await fetch('http://localhost:8000/api/validate-move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board: this.gameState.board,
                    move: {
                        from: { row: fromRow, col: fromCol },
                        to: { row: toRow, col: toCol }
                    },
                    currentPlayer: this.gameState.currentPlayer
                })
            });

            if (!response.ok) {
                console.warn('AI移动验证服务不可用，使用客户端验证');
                return { valid: true }; // 降级到客户端验证
            }

            return await response.json();
        } catch (error) {
            console.warn('AI移动验证失败，使用客户端验证:', error);
            return { valid: true }; // 降级到客户端验证
        }
    }

    // AI引擎状态检查
    async checkAIStatus() {
        try {
            const response = await fetch('http://localhost:8000/api/game-status');
            
            if (!response.ok) {
                throw new Error('服务器连接失败');
            }
            
            const status = await response.json();
            
            // 更新AI状态显示
            this.updateAIStatusDisplay(status);
            
            return status;
        } catch (error) {
            console.error('AI状态检查失败:', error);
            this.updateAIStatusDisplay({ ai_available: false, error: error.message });
            return { ai_available: false, error: error.message };
        }
    }

    // 更新AI状态显示
    updateAIStatusDisplay(status) {
        const statusElement = document.getElementById('aiStatus');
        if (!statusElement) {
            // 如果状态元素不存在，创建一个
            this.createAIStatusElement();
            return this.updateAIStatusDisplay(status);
        }

        if (status.ai_available) {
            statusElement.innerHTML = `
                <span style="color: #4caf50;">● AI引擎已连接</span>
                <small style="color: #666; margin-left: 10px;">v${status.version || '1.0.0'}</small>
            `;
            statusElement.className = 'ai-status online';
        } else {
            statusElement.innerHTML = `
                <span style="color: #f44336;">● AI引擎离线</span>
                <small style="color: #666; margin-left: 10px;">${status.error || '连接失败'}</small>
            `;
            statusElement.className = 'ai-status offline';
        }
    }

    // 创建AI状态显示元素
    createAIStatusElement() {
        const header = document.querySelector('header .controls');
        if (header && !document.getElementById('aiStatus')) {
            const statusElement = document.createElement('div');
            statusElement.id = 'aiStatus';
            statusElement.className = 'ai-status';
            statusElement.style.cssText = 'margin-left: 20px; font-size: 14px; display: flex; align-items: center;';
            header.appendChild(statusElement);
        }
    }

    // 局面评估
    async evaluateCurrentPosition() {
        try {
            const response = await fetch('http://localhost:8000/api/position-evaluation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board: this.gameState.board,
                    currentPlayer: this.gameState.currentPlayer
                })
            });

            if (!response.ok) {
                console.warn('局面评估服务不可用');
                return;
            }

            const evaluation = await response.json();
            
            if (evaluation.success) {
                this.displayPositionEvaluation(evaluation);
            }
        } catch (error) {
            console.warn('局面评估失败:', error);
        }
    }

    // 显示局面评估结果
    displayPositionEvaluation(evaluation) {
        let evaluationElement = document.getElementById('positionEvaluation');
        
        if (!evaluationElement) {
            this.createPositionEvaluationElement();
            evaluationElement = document.getElementById('positionEvaluation');
        }

        const { score, evaluation: evalText, advantage, details } = evaluation;
        const barColor = advantage.side === 'red' ? '#d32f2f' : 
                        advantage.side === 'black' ? '#424242' : '#2196f3';
        
        evaluationElement.innerHTML = `
            <h4>📊 局面评估</h4>
            <div class="evaluation-summary">
                <div class="evaluation-text">${evalText}</div>
                <div class="evaluation-score">评分: ${score > 0 ? '+' : ''}${score}</div>
            </div>
            <div class="advantage-bar">
                <div class="advantage-progress" style="
                    width: ${advantage.percentage}%; 
                    background: ${barColor};
                    height: 6px;
                    border-radius: 3px;
                    transition: all 0.3s ease;
                "></div>
            </div>
            <div class="evaluation-details">
                <small>
                    子力: ${details.material_balance.red_material} vs ${details.material_balance.black_material} |
                    机动性: ${details.mobility_factor.available_moves}手 |
                    控制: ${details.control_evaluation.total_control}
                </small>
            </div>
        `;
    }

    // 创建局面评估显示元素
    createPositionEvaluationElement() {
        const rightPanel = document.querySelector('.right-panel');
        if (rightPanel && !document.getElementById('positionEvaluation')) {
            const evaluationElement = document.createElement('div');
            evaluationElement.id = 'positionEvaluation';
            evaluationElement.className = 'position-evaluation';
            evaluationElement.style.cssText = `
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 20px;
                font-size: 14px;
            `;
            
            // 插入到AI信息前面
            const aiInfo = rightPanel.querySelector('.ai-info');
            rightPanel.insertBefore(evaluationElement, aiInfo);
        }
    }

    completeCapturedDarkPieceSelection(selectedPiece) {
        if (!this.pendingCapturedDarkPiece) {
            return false;
        }

        // 双重验证：确保选择的棋子没有达到数量上限
        if (this.isPieceLimitReached(selectedPiece)) {
            this.showMessage(`${this.pieceNames[selectedPiece]}的数量已达上限，请重新选择`, 'error');
            return false; // 验证失败
        }

        // 将被吃掉的暗子以其真实身份添加到被吃棋子列表
        const capturedByPlayer = this.pendingCapturedDarkPiece.capturedByPlayer;
        const move = this.pendingCapturedDarkPiece.move;
        
        // 修复逻辑：如果红方吃了对手暗子，被吃的是黑方暗子；反之亦然
        if (capturedByPlayer === 'red') {
            this.capturedPieces.black.push(selectedPiece);  // 红方吃了黑方的暗子
        } else {
            this.capturedPieces.red.push(selectedPiece);    // 黑方吃了红方的暗子
        }

        // 更新移动记录中被吃棋子的真实类型
        move.capturedPieceRealType = selectedPiece;
        move.capturedPiece = this.pendingCapturedDarkPiece.darkPiece; // 保留原始暗子符号

        // 清除pending状态
        this.pendingCapturedDarkPiece = null;

        this.showMessage(`被吃暗子已确认为${this.pieceNames[selectedPiece]}`, 'success');

        // 检查是否还有其他待处理的选择（如移动的棋子也是暗子）
        const fromPiece = move.piece;
        if (fromPiece.match(/[DEFGHIdefghi]/)) {
            // 移动的棋子也是暗子，需要用户选择真实身份
            this.showDarkPieceSelector(move.to.row, move.to.col, fromPiece, move);
            return true;
        }

        // 完成移动流程
        this.completeMoveExecution(move);
        
        return true; // 验证成功
    }

    completeDarkPieceSelection(row, col, selectedPiece, move) {
        // 双重验证：确保选择的棋子没有达到数量上限
        if (this.isPieceLimitReached(selectedPiece)) {
            this.showMessage(`${this.pieceNames[selectedPiece]}的数量已达上限，请重新选择`, 'error');
            return false; // 验证失败
        }
        
        // 设置暗子的真实身份
        this.gameState.board[row][col] = selectedPiece;
        
        // 更新移动记录中的棋子类型
        move.piece = selectedPiece;
        
        // 清除pending选择状态
        this.pendingDarkPieceSelection = null;
        
        // 完成移动流程
        this.completeMoveExecution(move);
        
        const currentCount = this.countTotalPieces(selectedPiece);
        const maxCount = this.pieceLimits[selectedPiece];
        this.showMessage(`暗子已翻开为${this.pieceNames[selectedPiece]} (${currentCount}/${maxCount})`, 'success');

        // 检查是否需要AI自动走棋
        this.triggerAIMove();
        
        return true; // 验证成功
    }

    completeMoveExecution(move) {
        // 切换玩家
        this.gameState.currentPlayer = this.gameState.currentPlayer === 'red' ? 'black' : 'red';
        
        // 取消选择
        this.deselectSquare();
        
        // 清除AI推荐高亮和箭头
        this.clearAIHighlight();
        
        // 在移动完全结束后，记录棋盘状态
        move.boardStateAfter = JSON.parse(JSON.stringify(this.gameState.board));

        // 更新历史记录
        this.gameState.gameHistory.push(move);
        this.gameState.currentMoveIndex++;
        this.lastMove = move;
        
        // 更新显示
        this.updateDisplay();
        
        // 检查游戏结束
        this.checkGameEnd();
        
        this.showMessage(`${move.player === 'red' ? '红方' : '黑方'}移动了${this.pieceNames[move.piece]}`, 'success');

        // 自动评估局面
        this.evaluateCurrentPosition();

        // 如果游戏没有结束，检查是否需要AI自动走棋
        if (!this.gameState.isGameOver) {
            this.triggerAIMove();
        }
    }

    getDarkPieceRealType(darkPiece, row, col) {
        // 根据暗子的初始位置确定其真实类型
        // 这里简化处理，实际应该根据初始映射
        const positionMapping = {
            // 红方暗子映射
            'D': 'R', 'E': 'N', 'F': 'B', 'G': 'A', 'H': 'C', 'I': 'P',
            // 黑方暗子映射
            'd': 'r', 'e': 'n', 'f': 'b', 'g': 'a', 'h': 'c', 'i': 'p'
        };
        return positionMapping[darkPiece] || darkPiece;
    }

    // 统计游戏中指定类型棋子的总数（棋盘上+被吃）
    countTotalPieces(pieceType) {
        let count = 0;
        
        // 1. 统计棋盘上的棋子
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.gameState.board[row][col] === pieceType) {
                    count++;
                }
            }
        }
        
        // 2. 统计被吃的棋子
        const isRedPiece = pieceType.match(/[RNBAKCP]/);
        const capturedList = isRedPiece ? this.capturedPieces.black : this.capturedPieces.red;
        capturedList.forEach(p => {
            if (p === pieceType) {
                count++;
            }
        });
        
        return count;
    }

    // 检查指定棋子类型是否已达到数量上限
    isPieceLimitReached(pieceType) {
        const currentCount = this.countTotalPieces(pieceType);
        const maxCount = this.pieceLimits[pieceType] || 0;
        return currentCount >= maxCount;
    }

    // 获取可用的棋子选项（排除已达上限的棋子）
    getAvailablePieceOptions(isRed) {
        const pieceTypes = isRed 
            ? ['R', 'N', 'B', 'A', 'C', 'P']  // 红方棋子（除了帅，暗子不能翻成帅）
            : ['r', 'n', 'b', 'a', 'c', 'p']; // 黑方棋子（除了将，暗子不能翻成将）
        
        return pieceTypes.map(pieceType => {
            const currentCount = this.countTotalPieces(pieceType);
            const maxCount = this.pieceLimits[pieceType];
            const isLimitReached = currentCount >= maxCount;
            
            return {
                type: pieceType,
                name: this.pieceNames[pieceType],
                isDisabled: isLimitReached,
                currentCount: currentCount,
                maxCount: maxCount
            };
        });
    }



    getSquareElement(logicRow, logicCol) {
        // 将逻辑坐标转换为显示坐标
        const displayRow = this.boardFlipped ? 9 - logicRow : logicRow;
        const displayCol = this.boardFlipped ? 8 - logicCol : logicCol;
        
        const squares = this.boardElement.querySelectorAll('.chess-square');
        const index = displayRow * 9 + displayCol;
        return squares[index];
    }

    updateCurrentPlayer() {
        this.currentTurnElement.textContent = this.gameState.currentPlayer === 'red' ? '红方' : '黑方';
        this.currentTurnElement.style.color = this.gameState.currentPlayer === 'red' ? '#d32f2f' : '#424242';
    }

    updateCapturedPieces() {
        this.redCapturedElement.innerHTML = this.capturedPieces.red.map(piece => 
            `<span class="captured-piece">${this.pieceNames[piece]}</span>`
        ).join('');
        
        this.blackCapturedElement.innerHTML = this.capturedPieces.black.map(piece => 
            `<span class="captured-piece">${this.pieceNames[piece]}</span>`
        ).join('');
    }

    updateHistory() {
        this.historyListElement.innerHTML = '';
        
        this.gameState.gameHistory.forEach((move, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            if (index === this.gameState.currentMoveIndex) {
                historyItem.classList.add('current');
            }
            
            // 如果被吃的是暗子且已确定真实类型，显示真实类型；否则显示原始类型
            const capturedPieceDisplay = move.capturedPiece !== '.' ? 
                (move.capturedPieceRealType ? move.capturedPieceRealType : move.capturedPiece) : '.';
            
            const moveText = `${index + 1}. ${move.player === 'red' ? '红' : '黑'}: ${this.pieceNames[move.piece]} ` +
                           `${this.positionToString(move.from)} → ${this.positionToString(move.to)}` +
                           (capturedPieceDisplay !== '.' ? ` 吃${this.pieceNames[capturedPieceDisplay]}` : '');
            
            historyItem.textContent = moveText;
            historyItem.addEventListener('click', () => this.gotoMove(index));
            
            this.historyListElement.appendChild(historyItem);
        });
        
        // 滚动到最新
        this.historyListElement.scrollTop = this.historyListElement.scrollHeight;
    }

    positionToString(pos) {
        return String.fromCharCode(97 + pos.col) + (pos.row + 1);
    }

    gotoMove(moveIndex) {
        if (moveIndex < -1 || moveIndex >= this.gameState.gameHistory.length) return;
        
        // 清除各种悬而未决的状态
        if (this.pendingDarkPieceSelection) {
            const existingSelector = document.querySelector('.panel-dark-piece-selector');
            if (existingSelector) existingSelector.remove();
            this.pendingDarkPieceSelection = null;
        }
        if (this.pendingCapturedDarkPiece) {
            const existingSelector = document.querySelector('.panel-captured-dark-piece-selector');
            if (existingSelector) existingSelector.remove();
            this.pendingCapturedDarkPiece = null;
        }

        this.gameState.currentMoveIndex = moveIndex;
        
        if (moveIndex === -1) {
            // 回到初始状态
            this.gameState.board = this.createInitialBoard();
            this.gameState.currentPlayer = 'red';
            this.capturedPieces = { red: [], black: [] };
            this.lastMove = null;
        } else {
            // 恢复到指定移动完成后的状态
            const move = this.gameState.gameHistory[moveIndex];
            this.gameState.board = JSON.parse(JSON.stringify(move.boardStateAfter));
            this.gameState.currentPlayer = move.player === 'red' ? 'black' : 'red';
            
            // 重建被吃棋子列表
            this.capturedPieces = { red: [], black: [] };
            for (let i = 0; i <= moveIndex; i++) {
                const historyMove = this.gameState.gameHistory[i];
                if (historyMove.capturedPiece !== '.') {
                    const capturedPieceType = historyMove.capturedPieceRealType || historyMove.capturedPiece;
                    if (historyMove.player === 'red') {
                        this.capturedPieces.black.push(capturedPieceType);
                    } else {
                        this.capturedPieces.red.push(capturedPieceType);
                    }
                }
            }
            this.lastMove = move;
        }
        
        this.deselectSquare();
        this.clearAIHighlight();
        this.updateDisplay();
    }

    checkGameEnd() {
        // 检查是否有将/帅被吃
        let redKingExists = false;
        let blackKingExists = false;
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = this.gameState.board[row][col];
                if (piece === 'K') redKingExists = true;
                if (piece === 'k') blackKingExists = true;
            }
        }
        
        if (!redKingExists) {
            this.gameState.isGameOver = true;
            this.gameState.winner = 'black';
            this.showMessage('黑方获胜！红帅被吃。', 'success');
        } else if (!blackKingExists) {
            this.gameState.isGameOver = true;
            this.gameState.winner = 'red';
            this.showMessage('红方获胜！黑将被吃。', 'success');
        }
    }

    // 消息显示
    showMessage(text, type = 'info') {
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        
        this.messageAreaElement.appendChild(message);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (message.parentNode) {
                message.parentNode.removeChild(message);
            }
        }, 3000);
    }

    // 弹窗显示
    showModal(title, message, confirmCallback = null) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalConfirm = document.getElementById('modalConfirm');
        const modalCancel = document.getElementById('modalCancel');
        
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modal.style.display = 'block';
        
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        modalCancel.onclick = closeModal;
        modalConfirm.onclick = () => {
            if (confirmCallback) confirmCallback();
            closeModal();
        };
        
        // 点击背景关闭
        modal.onclick = (e) => {
            if (e.target === modal) {
                // 如果是暗子选择模式，不允许关闭
                if (modal.dataset.mode === 'dark-piece-selection') {
                    this.showMessage('必须选择暗子类型才能继续游戏', 'warning');
                    return;
                }
                
                closeModal();
                const modalButtons = modal.querySelector('.modal-buttons');
                modalButtons.style.display = 'flex'; // 恢复默认按钮显示
            }
        };
    }

    setupEventListeners() {
        // 新游戏
        document.getElementById('newGame').addEventListener('click', () => {
            this.showModal('确认新游戏', '确定要开始新游戏吗？当前进度将丢失。', () => {
                // 清除可能存在的暗子选择器
                const existingSelector = document.querySelector('.panel-dark-piece-selector');
                if (existingSelector) {
                    existingSelector.remove();
                }
                
                this.initializeGame();
                this.clearAIHighlight();
                this.aiRecommendation = null;
                this.aiRecommendationElement.innerHTML = '<p>选择红方AI、黑方AI或双方AI获取推荐走法</p>';
                this.updateDisplay();
                this.showMessage('新游戏开始！', 'success');
                this.lastMove = null;
            });
        });

        // 悔棋
        document.getElementById('undoMove').addEventListener('click', () => {
            // 如果有待处理的选择，悔棋意味着取消当前操作
            if (this.pendingDarkPieceSelection || this.pendingCapturedDarkPiece) {
                // 清理界面
                const darkPieceSelector = document.querySelector('.panel-dark-piece-selector');
                if (darkPieceSelector) darkPieceSelector.remove();
                const capturedDarkPieceSelector = document.querySelector('.panel-captured-dark-piece-selector');
                if (capturedDarkPieceSelector) capturedDarkPieceSelector.remove();
                
                // 重置状态
                this.pendingDarkPieceSelection = null;
                this.pendingCapturedDarkPiece = null;

                // 由于移动还没有完成（没有加入历史），只需要回退棋盘状态
                // 恢复到当前历史位置的状态
                this.gotoMove(this.gameState.currentMoveIndex);
                this.showMessage('操作已取消', 'success');
                return;
            }
            
            if (this.gameState.currentMoveIndex >= 0) {
                this.gotoMove(this.gameState.currentMoveIndex - 1);
                this.showMessage('悔棋成功', 'success');
            } else {
                this.showMessage('没有可以悔棋的步数', 'warning');
            }
        });



        // 翻转棋盘
        document.getElementById('switchBoard').addEventListener('click', () => {
            this.boardFlipped = !this.boardFlipped;
            this.updateBoard();
            this.showMessage('棋盘已翻转', 'info');
        });

        // AI开关事件
        document.getElementById('redAiToggle').addEventListener('change', (e) => {
            this.aiToggles.red = e.target.checked;
            this.showMessage(`红方AI已${this.aiToggles.red ? '开启' : '关闭'}`, 'info');
            if (this.aiToggles.red && this.gameState.currentPlayer === 'red') {
                this.triggerAIMove();
            }
        });

        document.getElementById('blackAiToggle').addEventListener('change', (e) => {
            this.aiToggles.black = e.target.checked;
            this.showMessage(`黑方AI已${this.aiToggles.black ? '开启' : '关闭'}`, 'info');
            if (this.aiToggles.black && this.gameState.currentPlayer === 'black') {
                this.triggerAIMove();
            }
        });

        // AI提示按钮
        document.getElementById('getRedAiHint').addEventListener('click', () => {
            this.getAIRecommendation('red');
            this.setActiveAIButton('red');
        });

        document.getElementById('getBlackAiHint').addEventListener('click', () => {
            this.getAIRecommendation('black');
            this.setActiveAIButton('black');
        });

        document.getElementById('getBothAiHint').addEventListener('click', () => {
            this.getAIRecommendation('both');
            this.setActiveAIButton('both');
        });

        // 执行AI推荐
        document.getElementById('executeAiMove').addEventListener('click', () => {
            this.executeAIRecommendation();
        });



        // 关闭弹窗
        document.querySelector('.close').addEventListener('click', () => {
            const modal = document.getElementById('modal');
            const modalButtons = modal.querySelector('.modal-buttons');
            
            // 如果是暗子选择模式，不允许关闭
            if (modal.dataset.mode === 'dark-piece-selection') {
                this.showMessage('必须选择暗子类型才能继续游戏', 'warning');
                return;
            }
            
            modal.style.display = 'none';
            modalButtons.style.display = 'flex'; // 恢复默认按钮显示
        });
    }

    setActiveAIButton(type) {
        // 移除所有按钮的active状态
        document.getElementById('getRedAiHint').classList.remove('active');
        document.getElementById('getBlackAiHint').classList.remove('active');
        document.getElementById('getBothAiHint').classList.remove('active');
        
        // 设置当前按钮为active
        if (type === 'red') {
            document.getElementById('getRedAiHint').classList.add('active');
        } else if (type === 'black') {
            document.getElementById('getBlackAiHint').classList.add('active');
        } else if (type === 'both') {
            document.getElementById('getBothAiHint').classList.add('active');
        }
    }

    // AI相关方法
    async getAIRecommendation(playerType = 'current') {
        try {
            if (playerType === 'both') {
                this.aiRecommendationElement.innerHTML = '<p>正在获取双方AI推荐...</p>';
                // 获取双方推荐
                await this.getBothPlayerRecommendations();
                return;
            }
            
            const targetPlayer = playerType === 'current' ? this.gameState.currentPlayer : playerType;
            this.aiRecommendationElement.innerHTML = `<p>正在获取${targetPlayer === 'red' ? '红方' : '黑方'}AI推荐...</p>`;
            
            // 发送棋盘状态到后端AI
            const response = await fetch('http://localhost:8000/api/ai-recommendation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board: this.gameState.board,
                    currentPlayer: targetPlayer,
                    history: this.gameState.gameHistory
                })
            });
            
            if (!response.ok) {
                throw new Error('AI服务暂时不可用');
            }
            
            const recommendation = await response.json();
            
            // 如果AI开启，则自动执行
            if (this.isAIActive(targetPlayer)) {
                this.executeAIRecommendation(recommendation);
            } else {
                this.aiRecommendation = recommendation;
                this.displayAIRecommendation(recommendation, targetPlayer);
            }
            
        } catch (error) {
            this.aiRecommendationElement.innerHTML = `<p style="color: #e74c3c;">获取AI推荐失败: ${error.message}</p>`;
            this.showMessage('获取AI推荐失败', 'error');
        }
    }

    async getBothPlayerRecommendations() {
        try {
            // 同时获取红方和黑方的推荐
            const [redResponse, blackResponse] = await Promise.all([
                fetch('http://localhost:8000/api/ai-recommendation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        board: this.gameState.board,
                        currentPlayer: 'red',
                        history: this.gameState.gameHistory
                    })
                }),
                fetch('http://localhost:8000/api/ai-recommendation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        board: this.gameState.board,
                        currentPlayer: 'black',
                        history: this.gameState.gameHistory
                    })
                })
            ]);

            if (!redResponse.ok || !blackResponse.ok) {
                throw new Error('AI服务暂时不可用');
            }

            const redRecommendation = await redResponse.json();
            const blackRecommendation = await blackResponse.json();

            this.aiRecommendation = { red: redRecommendation, black: blackRecommendation };
            this.displayBothRecommendations(redRecommendation, blackRecommendation);

        } catch (error) {
            this.aiRecommendationElement.innerHTML = `<p style="color: #e74c3c;">获取双方AI推荐失败: ${error.message}</p>`;
            this.showMessage('获取双方AI推荐失败', 'error');
        }
    }

    displayAIRecommendation(recommendation, playerType) {
        if (!recommendation || !recommendation.move) {
            this.aiRecommendationElement.innerHTML = '<p>AI暂无推荐</p>';
            return;
        }

        const { move, score, depth, details } = recommendation;
        const playerName = playerType === 'red' ? '红方' : '黑方';
        const playerColor = playerType === 'red' ? '#d32f2f' : '#424242';
        
        // 在棋盘上高亮显示AI推荐的移动
        this.highlightAIRecommendation(move, playerType);
        
        let html = `
            <div class="ai-recommendation-header" style="color: ${playerColor}; border-left: 4px solid ${playerColor}; padding-left: 10px; margin-bottom: 15px;">
                <h4>${playerName} AI推荐</h4>
            </div>
            <div class="ai-move-detail">
                <strong>推荐走法:</strong> ${this.pieceNames[move.piece]} (${move.piece.match(/[RNBAKCPDEFGHI]/) ? '红方' : '黑方'}) 
                ${this.positionToString(move.from)} → ${this.positionToString(move.to)}
            </div>
            <div class="ai-move-detail">
                <strong>搜索深度:</strong> ${depth}
            </div>
            <div class="ai-move-detail">
                <strong>评估分数:</strong> ${score}
            </div>
        `;
        
        if (move.isCapture) {
            html += `
                <div class="ai-move-detail">
                    <strong>吃子:</strong> ${this.pieceNames[move.capturedPiece]}
                </div>
            `;
        }
        
        if (details && details.length > 0) {
            html += '<div class="ai-move-detail"><strong>分析:</strong><ul>';
            details.forEach(detail => {
                html += `<li>${detail}</li>`;
            });
            html += '</ul></div>';
        }
        
        html += `
            <div class="ai-move-visual">
                <p><small>棋盘上已标出推荐走法</small></p>
            </div>
        `;
        
        this.aiRecommendationElement.innerHTML = html;
    }

    displayBothRecommendations(redRecommendation, blackRecommendation) {
        // 清除之前的高亮
        this.clearAIHighlight();
        
        let html = '<div class="both-recommendations">';
        
        // 红方推荐
        if (redRecommendation && redRecommendation.move) {
            const { move: redMove, score: redScore, depth: redDepth } = redRecommendation;
            this.highlightAIRecommendation(redMove, 'red');
            
            html += `
                <div class="ai-recommendation-section red-section">
                    <div class="ai-recommendation-header" style="color: #d32f2f; border-left: 4px solid #d32f2f; padding-left: 10px; margin-bottom: 10px;">
                        <h5>🔴 红方推荐</h5>
                    </div>
                    <div class="ai-move-detail">
                        <strong>走法:</strong> ${this.pieceNames[redMove.piece]} (${redMove.piece.match(/[RNBAKCPDEFGHI]/) ? '红方' : '黑方'}) 
                        ${this.positionToString(redMove.from)} → ${this.positionToString(redMove.to)}
                    </div>
                    <div class="ai-move-detail">
                        <strong>评分:</strong> ${redScore} (深度: ${redDepth})
                    </div>
                </div>
            `;
        }
        
        // 黑方推荐
        if (blackRecommendation && blackRecommendation.move) {
            const { move: blackMove, score: blackScore, depth: blackDepth } = blackRecommendation;
            this.highlightAIRecommendation(blackMove, 'black');
            
            html += `
                <div class="ai-recommendation-section black-section">
                    <div class="ai-recommendation-header" style="color: #424242; border-left: 4px solid #424242; padding-left: 10px; margin-bottom: 10px;">
                        <h5>⚫ 黑方推荐</h5>
                    </div>
                    <div class="ai-move-detail">
                        <strong>走法:</strong> ${this.pieceNames[blackMove.piece]} (${blackMove.piece.match(/[RNBAKCPDEFGHI]/) ? '红方' : '黑方'}) 
                        ${this.positionToString(blackMove.from)} → ${this.positionToString(blackMove.to)}
                    </div>
                    <div class="ai-move-detail">
                        <strong>评分:</strong> ${blackScore} (深度: ${blackDepth})
                    </div>
                </div>
            `;
        }
        
        html += `
            <div class="ai-move-visual">
                <p><small>棋盘上同时显示双方推荐走法</small></p>
            </div>
        </div>`;
        
        this.aiRecommendationElement.innerHTML = html;
    }

    highlightAIRecommendation(move, playerType = 'blue') {
        // 不清除之前的高亮，支持同时显示多个推荐
        
        // 设置颜色
        const colors = {
            'red': { from: 'ai-from-red', to: 'ai-to-red', arrow: '#d32f2f' },
            'black': { from: 'ai-from-black', to: 'ai-to-black', arrow: '#424242' },
            'blue': { from: 'ai-from', to: 'ai-to', arrow: '#2196f3' }
        };
        const color = colors[playerType] || colors.blue;
        
        // 高亮起始位置
        const fromSquare = this.getSquareElement(move.from.row, move.from.col);
        if (fromSquare) {
            fromSquare.classList.add(color.from);
        }
        
        // 高亮目标位置
        const toSquare = this.getSquareElement(move.to.row, move.to.col);
        if (toSquare) {
            toSquare.classList.add(color.to);
        }
        
        // 添加箭头指示
        this.addAIArrow(move.from, move.to, color.arrow, playerType);
    }

    clearAIHighlight() {
        // 清除AI推荐高亮
        const squares = this.boardElement.querySelectorAll('.chess-square');
        squares.forEach(square => {
            square.classList.remove('ai-from', 'ai-to', 'ai-from-red', 'ai-to-red', 'ai-from-black', 'ai-to-black');
        });
        
        // 移除箭头
        const arrows = this.boardElement.querySelectorAll('.ai-arrow');
        arrows.forEach(arrow => arrow.remove());
    }

    addAIArrow(from, to, color = '#2196f3', playerType = 'blue') {
        // 计算箭头方向
        const deltaRow = to.row - from.row;
        const deltaCol = to.col - from.col;
        
        let arrowSymbol = '→';
        let rotation = 0;
        
        // 根据移动方向确定箭头符号和旋转角度
        if (deltaRow === 0) {
            // 水平移动
            arrowSymbol = deltaCol > 0 ? '→' : '←';
        } else if (deltaCol === 0) {
            // 垂直移动
            arrowSymbol = deltaRow > 0 ? '↓' : '↑';
        } else {
            // 斜对角移动
            if (deltaRow > 0 && deltaCol > 0) {
                arrowSymbol = '↘';
            } else if (deltaRow > 0 && deltaCol < 0) {
                arrowSymbol = '↙';
            } else if (deltaRow < 0 && deltaCol > 0) {
                arrowSymbol = '↗';
            } else {
                arrowSymbol = '↖';
            }
        }
        
        // 创建箭头元素显示AI推荐路径
        const arrow = document.createElement('div');
        arrow.className = `ai-arrow ai-arrow-${playerType}`;
        arrow.innerHTML = arrowSymbol;
        
        // 计算箭头位置
        const fromSquare = this.getSquareElement(from.row, from.col);
        const toSquare = this.getSquareElement(to.row, to.col);
        
        if (fromSquare && toSquare) {
            const fromRect = fromSquare.getBoundingClientRect();
            const toRect = toSquare.getBoundingClientRect();
            const boardRect = this.boardElement.getBoundingClientRect();
            
            const centerX = (fromRect.left + toRect.left) / 2 - boardRect.left + fromRect.width / 2;
            const centerY = (fromRect.top + toRect.top) / 2 - boardRect.top + fromRect.height / 2;
            
            arrow.style.position = 'absolute';
            arrow.style.left = centerX + 'px';
            arrow.style.top = centerY + 'px';
            arrow.style.transform = 'translate(-50%, -50%)';
            arrow.style.fontSize = '28px';
            arrow.style.color = color;
            arrow.style.fontWeight = 'bold';
            arrow.style.zIndex = '10';
            arrow.style.pointerEvents = 'none';
            arrow.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
            
            this.boardElement.appendChild(arrow);
        }
    }

    executeAIRecommendation(recommendation) {
        if (!recommendation || !recommendation.move) {
            this.showMessage('没有可执行的AI推荐', 'warning');
            return;
        }

        const { move } = recommendation;
        const success = this.attemptMove(move.from.row, move.from.col, move.to.row, move.to.col);

        if (success) {
            this.showMessage('AI推荐已执行', 'success');
            this.clearAIHighlight();
            this.aiRecommendation = null;
            this.aiRecommendationElement.innerHTML = '<p>等待玩家或AI操作</p>';
            // AI移动也是移动，所以要更新lastMove
            this.lastMove = { from: move.from, to: move.to };
            this.updateDisplay();
        }
    }

    // 新增：检查并触发AI走棋
    triggerAIMove() {
        const currentPlayer = this.gameState.currentPlayer;
        if (this.isAIActive(currentPlayer) && !this.gameState.isGameOver) {
            this.showMessage(`${currentPlayer === 'red' ? '红方' : '黑方'}AI正在思考...`, 'info');
            // 延迟一小段时间，让UI更新
            setTimeout(() => {
                this.getAIRecommendation(currentPlayer);
            }, 500);
        }
    }

    // 新增：判断当前玩家的AI是否激活
    isAIActive(player) {
        return this.aiToggles[player];
    }

    // 判断当前移动是否应该显示"您吃掉了对手的暗子！"的提示
    canPlayerSpecifyDarkPieceType(capturedDarkPiece, movingPlayer) {
        // 新规则：当某一方开启了AI后，AI方吃子时总会显示提示，非AI方吃子时不显示提示
        
        // 检查是否有任何一方开启了AI
        const hasAnyAIEnabled = this.aiToggles.red || this.aiToggles.black;
        
        if (!hasAnyAIEnabled) {
            // 如果没有开启AI，保持原有逻辑：基于界面位置判断
            const bottomPlayerIsRed = !this.boardFlipped;
            const isMyMove = (bottomPlayerIsRed && movingPlayer === 'red') || (!bottomPlayerIsRed && movingPlayer === 'black');
            
            if (!isMyMove) {
                return false;
            }

            const isRedPiece = (p) => p.match(/[RNBAKCPDEFGHI]/);
            const capturedIsRed = !!isRedPiece(capturedDarkPiece);
            const capturedBelongsToOpponent = bottomPlayerIsRed !== capturedIsRed;
            return capturedBelongsToOpponent;
        }

        // 有AI开启的情况：只有AI方吃子时才显示提示
        const isAIMove = this.isAIActive(movingPlayer);
        
        if (!isAIMove) {
            // 非AI方吃子，不显示提示
            return false;
        }

        // AI方吃子，检查被吃的是否为对手的暗子
        const isRedPiece = (p) => p.match(/[RNBAKCPDEFGHI]/);
        const capturedIsRed = !!isRedPiece(capturedDarkPiece);
        const movingPlayerIsRed = movingPlayer === 'red';
        
        // 被吃的棋子必须属于对手
        return capturedIsRed !== movingPlayerIsRed;
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new JieqiGame();
});
