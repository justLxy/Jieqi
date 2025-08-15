#include <pybind11/pybind11.h>
#include <pybind11/stl.h> // Include for automatic type conversion
#include <vector>
#include <iostream>
#include "global/global.h" // 引入 MAX_ZOBRIST 的定义
#include "board/board.h"
#include "board/aiboard5.h" // 切换到 AI5

// Forward declaration of necessary functions from the codebase
extern bool read_score_table(const char* score_file, short pst[][256]);
extern void IntializeL1();
extern short pstglobal[5][123][256];

// Global transposition table
tp* tptable = nullptr;

// Function to initialize necessary components
void initialize_engine() {
    if (tptable == nullptr) {
        tptable = new (std::nothrow) tp[MAX_ZOBRIST];
    }
    IntializeL1();
    memset(pstglobal, 0, sizeof(pstglobal));
    // It's better to load the score table once
    if (!read_score_table("../score.conf", pstglobal[3])) {
        std::cerr << "Failed to load score.conf" << std::endl;
    }
}

std::string get_ai_move(const std::string& board_json_str, bool is_red_turn, int history_len, int depth) {
    // 1. Setup the board instance.
    board::Board board_instance;
    board_instance.turn = is_red_turn;
    board_instance.round = history_len / 2;

    // 2. Populate state_red from the web UI's perspective.
    // We must start with the initial state to get the correct padding.
    for (int r = 0; r < 10; ++r) {
        for (int c = 0; c < 9; ++c) {
            int internal_pos = board_instance.translate_x_y(r, c);
            char piece = board_json_str[r * 9 + c];
            board_instance.state_red[internal_pos] = piece;
        }
    }

    // 3. Populate state_black by copying and rotating state_red.
    memcpy(board_instance.state_black, board_instance.state_red, 257);
    board_instance.rotate(board_instance.state_black); // rotate will also swap case.

    // This is crucial for the AI to reason about dark pieces
    board_instance.GenerateRandomMap();
    board_instance.initialize_di();

    // 4. Initialize the AI Thinker with the correct state and turn flag.
    std::unique_ptr<board::Thinker> thinker;
    if (is_red_turn) {
        thinker.reset(new board::AIBoard5( // 使用 AI5
            board_instance.state_red,
            board_instance.turn, // true
            board_instance.round,
            board_instance.di_red,
            0, tptable, &board_instance.hist
        ));
    } else {
        // When it is black's turn, the AI needs the black-perspective board AND the turn flag set to false.
        thinker.reset(new board::AIBoard5( // 使用 AI5
            board_instance.state_black,
            board_instance.turn, // false
            board_instance.round,
            board_instance.di_black,
            0, tptable, &board_instance.hist
        ));
    }

    if (!thinker) {
        return "ERROR:Could not create thinker";
    }

    // 7. Think and get the best move in UCCI format
    std::string best_move_ucci = thinker->Think(depth);

    if (best_move_ucci.rfind("ERROR", 0) == 0 || best_move_ucci.length() != 4) {
        return best_move_ucci; // Return error or invalid move string
    }

    // 6. If it was black's turn, the move was calculated on the rotated board. We must convert it back.
    if (!is_red_turn) {
        const int y1 = (int)(best_move_ucci[0] - 'a');
        const int x1 = (int)(best_move_ucci[1] - '0');
        const int y2 = (int)(best_move_ucci[2] - 'a');
        const int x2 = (int)(best_move_ucci[3] - '0');

        int from_pos = board_instance.translate_x_y(x1, y1);
        int to_pos = board_instance.translate_x_y(x2, y2);

        // Reverse the coordinates to map them back to the original (red) perspective.
        int reversed_from = board_instance.reverse(from_pos);
        int reversed_to = board_instance.reverse(to_pos);

        char final_move_ucci[5];
        board::Board::Translate((unsigned char)reversed_from, (unsigned char)reversed_to, final_move_ucci);
        return std::string(final_move_ucci);
    }

    // If it was red's turn, the move is already in the correct coordinate system.
    return best_move_ucci;
}

PYBIND11_MODULE(cppjieqi, m) {
    m.doc() = "pybind11 plugin for Jieqi AI engine";
    
    m.def("initialize", &initialize_engine, "Initializes the AI engine resources");
    m.def("get_ai_move", &get_ai_move, "Gets the best move from the AI engine",
          pybind11::arg("board_str"), 
          pybind11::arg("is_red_turn"), 
          pybind11::arg("history_len"), 
          pybind11::arg("depth") = 9);
}
