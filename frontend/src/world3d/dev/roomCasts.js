/**
 * Dev-only: who sits where in each room for the evidence renders (modelled on the
 * drafts). seat = seat name from the room layout; look = LOOKS index (look.js);
 * emote replays every `every` seconds. The first entry is the local player.
 */
export const ROOM_CASTS = {
  "living-room": [
    { id: "demir", seat: "SEAT_sofa2_0", look: 0 },
    { id: "ayse", seat: "SEAT_sofa_0", look: 3, emote: "cheer", every: 2.6 },
    { id: "mert", seat: "SEAT_sofa_1", look: 5, emote: "clap", every: 3.0 },
    { id: "zeynep", seat: "SEAT_sofa_2", look: 2, emote: "cheer", every: 2.6 },
  ],
  // scene-1.jpg: seven people facing the screen, some waving
  cinema: [
    { id: "demir", seat: "SEAT_cinema_1_1", look: 7 },
    { id: "ayse", seat: "SEAT_cinema_0_1", look: 4, emote: "wave", every: 3.2 },
    { id: "mert", seat: "SEAT_cinema_1_3", look: 6, emote: "wave", every: 2.8 },
    { id: "zeynep", seat: "SEAT_cinema_1_4", look: 9, emote: "clap", every: 3.4 },
    { id: "can", seat: "SEAT_cinema_0_4", look: 1 },
    { id: "elif", seat: "SEAT_cinema_0_5", look: 8, emote: "wave", every: 3.0 },
    { id: "deniz", seat: "SEAT_cinema_2_1", look: 5 },
  ],
  // scene-2.jpg: five players round the blackjack table, the robot deals
  // (seats by phi: 0 back left, 1 left, 2 near left, 3 near right, 4 right)
  "game-room": [
    { id: "demir", seat: "SEAT_bj_2", look: 6 },
    { id: "ayse", seat: "SEAT_bj_0", look: 7 },
    { id: "mert", seat: "SEAT_bj_1", look: 4 },
    { id: "zeynep", seat: "SEAT_bj_3", look: 9 },
    { id: "can", seat: "SEAT_bj_4", look: 3, emote: "laugh", every: 4.0 },
  ],
  // scene-4.jpg: four round the fire, one telling a story
  camp: [
    { id: "demir", seat: "SEAT_camp_FL_1", look: 5 },
    { id: "mert", seat: "SEAT_camp_BL_1", look: 3, emote: "wave", every: 3.4 },
    { id: "elif", seat: "SEAT_camp_BR_0", look: 9 },
    { id: "can", seat: "SEAT_camp_FR_0", look: 0 },
  ],
};
