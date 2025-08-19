#ifndef thinker_h
#define thinker_h

#include "../global/global.h"
#include "../score/score.h"

namespace board{
    class Thinker{
    public:
        bool thinker_type; //true: Human, false: AI
        int retry_num;
        bool turn;
        virtual ~Thinker() = default; // Add virtual destructor
        virtual std::string Think(int maxdepth) = 0;
    };
}

#endif
