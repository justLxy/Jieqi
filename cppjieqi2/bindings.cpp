#include <pybind11/pybind11.h>
#include <pybind11/stl.h> // Include for automatic type conversion
#include <vector>
#include "board/board.h"
#include "board/aiboard5.h"
#include "global/global.h"
#include <iostream>
#include <string>
#include <memory>
#include <unordered_map>
#include <mutex>

// Forward declaration of necessary functions from the codebase
extern short pstglobal[5][123][256];
extern unsigned char L1[256][256];
extern bool read_score_table(const char* score_file, short pst[123][256]);
extern void IntializeL1();

// Global transposition table
std::vector<tp> tptable;
std::mutex tptable_mutex;

// Class to manage AI board instances
class AIManager {
public:
    AIManager() : last_id(0) {}

    uint64_t create_game() {
        std::lock_guard<std::mutex> lock(mtx);
        uint64_t id = ++last_id;
        char initial_state[257] = {0};
        unsigned char di[VERSION_MAX][2][123] = {{{0}}};
        histories[id] = std::make_unique<std::unordered_map<std::string, bool>>();
        boards[id] = std::make_unique<board::AIBoard5>(initial_state, true, 0, di, 0, histories[id].get());
        return id;
    }

    void delete_game(uint64_t id) {
        std::lock_guard<std::mutex> lock(mtx);
        boards.erase(id);
        histories.erase(id);
    }

    board::AIBoard5* get_board(uint64_t id) {
        std::lock_guard<std::mutex> lock(mtx);
        auto it = boards.find(id);
        if (it != boards.end()) {
            return it->second.get();
        }
        return nullptr;
    }

private:
    std::mutex mtx;
    uint64_t last_id;
    std::unordered_map<uint64_t, std::unique_ptr<board::AIBoard5>> boards;
    std::unordered_map<uint64_t, std::unique_ptr<std::unordered_map<std::string, bool>>> histories;
};

AIManager ai_manager;

// Function to initialize necessary components
void initialize_engine() {
    // No longer needed for AIBoard5 as it seems to manage its own memory or doesn't use a global tptable
    // std::lock_guard<std::mutex> lock(tptable_mutex);
    // if (tptable.empty()) {
    //     try {
    //         tptable.resize(MAX_ZOBRIST);
    //     } catch (const std::bad_alloc& e) {
    //         std::cerr << "Failed to allocate transposition table: " << e.what() << std::endl;
    //         return;
    //     }
    // }
    IntializeL1();
    memset(pstglobal, 0, sizeof(pstglobal));
    // It's better to load the score table once
    if (!read_score_table("../score.conf", pstglobal[3])) {
        std::cerr << "Failed to load score.conf" << std::endl;
    }
}

void set_board(uint64_t game_id, const std::string& board_json_str, bool is_red_turn, int history_len) {
    board::AIBoard5* ai_board_instance = ai_manager.get_board(game_id);
    if (!ai_board_instance) {
        return; // Or handle error
    }

    // Use a temporary Board instance to set up initial state and generate DI info
    board::Board setup_board;
    setup_board.turn = is_red_turn;
    setup_board.round = history_len / 2;

    for (int r = 0; r < 10; ++r) {
        for (int c = 0; c < 9; ++c) {
            int internal_pos = setup_board.translate_x_y(r, c);
            char piece = board_json_str[r * 9 + c];
            setup_board.state_red[internal_pos] = piece;
        }
    }
    memcpy(setup_board.state_black, setup_board.state_red, 257);
    setup_board.rotate(setup_board.state_black);
    
    // These methods belong to Board, not AIBoard5
    setup_board.GenerateRandomMap();
    setup_board.initialize_di();

    // Now, transfer the state to the persistent AIBoard5 instance
    ai_board_instance->turn = is_red_turn;
    ai_board_instance->round = history_len / 2;
    memcpy(ai_board_instance->state_red, setup_board.state_red, 257);
    memcpy(ai_board_instance->state_black, setup_board.state_black, 257);
    
    // Copy the correct DI array based on the turn
    if (is_red_turn) {
        ai_board_instance->CopyData(setup_board.di_red);
    } else {
        ai_board_instance->CopyData(setup_board.di_black);
    }
    
    ai_board_instance->Reset(); // Re-initialize zobrist hash and other states
    ai_board_instance->Scan();
}

std::string get_ai_move_stateful(uint64_t game_id, int depth) {
    board::AIBoard5* thinker = ai_manager.get_board(game_id);
    if (!thinker) {
        return "ERROR:Invalid game ID";
    }

    bool is_red_turn = thinker->turn;

    // The thinker is already set up with the correct state.
    // We need to create a temporary thinker instance for the search,
    // or make the Think method const.
    // For now, we will just call Think on the existing instance.
    std::string best_move_ucci = thinker->Think(depth);

    if (best_move_ucci.rfind("ERROR", 0) == 0 || best_move_ucci.length() != 4) {
        return best_move_ucci; // Return error or invalid move string
    }

    // If it was black's turn, the move was calculated on the rotated board. We must convert it back.
    if (!is_red_turn) {
        const int y1 = (int)(best_move_ucci[0] - 'a');
        const int x1 = (int)(best_move_ucci[1] - '0');
        const int y2 = (int)(best_move_ucci[2] - 'a');
        const int x2 = (int)(best_move_ucci[3] - '0');

        int from_pos = thinker->translate_x_y(x1, y1);
        int to_pos = thinker->translate_x_y(x2, y2);

        int reversed_from = thinker->reverse(from_pos);
        int reversed_to = thinker->reverse(to_pos);

        char final_move_ucci[5];
        board::Board::Translate((unsigned char)reversed_from, (unsigned char)reversed_to, final_move_ucci);
        return std::string(final_move_ucci);
    }

    return best_move_ucci;
}

int get_board_evaluation_stateful(uint64_t game_id) {
    board::AIBoard5* board_eval = ai_manager.get_board(game_id);
     if (!board_eval) {
        return 0; // Or some error code
    }

    bool original_turn = board_eval->turn; // Save the original turn
    board_eval->turn = true; // Force red's perspective for evaluation
    
    board_eval->Scan();

    // Use score_rough, which is calculated by Scan(), not the dynamic 'score' member.
    int score_val = board_eval->score_rough + board_eval->kongtoupao_score - board_eval->kongtoupao_score_opponent;
    
    board_eval->turn = original_turn; // Restore the original turn
    
    // The score from Scan() is from red's perspective. If it's black's turn, negate it.
    if (!original_turn) {
        score_val = -score_val;
    }
    
    return score_val;
}


PYBIND11_MODULE(cppjieqi, m) {
    m.doc() = "pybind11 plugin for Jieqi AI engine";
    
    m.def("initialize", &initialize_engine, "Initializes the AI engine resources");
    m.def("create_game", []() { return ai_manager.create_game(); }, "Creates a new game instance and returns its ID");
    m.def("delete_game", [](uint64_t game_id) { ai_manager.delete_game(game_id); }, "Deletes a game instance", pybind11::arg("game_id"));
    m.def("set_board", &set_board, "Sets the board state for a game instance",
          pybind11::arg("game_id"),
          pybind11::arg("board_str"),
          pybind11::arg("is_red_turn"),
          pybind11::arg("history_len"));
    m.def("get_ai_move", &get_ai_move_stateful, "Gets the best move from the AI engine for a given game",
          pybind11::arg("game_id"),
          pybind11::arg("depth") = 8);
    m.def("get_board_evaluation", &get_board_evaluation_stateful, "Gets the static evaluation of the board for a given game",
          pybind11::arg("game_id"));
}
