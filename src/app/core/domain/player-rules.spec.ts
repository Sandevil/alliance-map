import { createInitialMapState } from './default-state';
import { addPlayerToGeneralList, movePlayerBetweenLists } from './player-rules';

describe('player-rules', () => {
  it('adds player to target general list', () => {
    const state = createInitialMapState();

    const result = addPlayerToGeneralList(state, {
      id: 'p1',
      name: 'Player 1',
      power: 123,
      targetGeneralList: 'trap1General',
    });

    expect(result.ok).toBeTrue();
    expect(state.players.trap1General.length).toBe(1);
  });

  it('adds player to no-trap general list', () => {
    const state = createInitialMapState();

    const result = addPlayerToGeneralList(state, {
      id: 'p-no-trap',
      name: 'No Trap Player',
      power: 321,
      targetGeneralList: 'noTrapGeneral',
    });

    expect(result.ok).toBeTrue();
    expect(state.players.noTrapGeneral.length).toBe(1);
  });

  it('prevents duplicates across all lists', () => {
    const state = createInitialMapState();

    addPlayerToGeneralList(state, {
      id: 'p1',
      name: 'Player 1',
      power: 123,
      targetGeneralList: 'trap1General',
    });

    const duplicate = addPlayerToGeneralList(state, {
      id: 'p1',
      name: 'Player 1 duplicate',
      power: 456,
      targetGeneralList: 'trap2General',
    });

    expect(duplicate.ok).toBeFalse();
    expect(duplicate.errors.some((error) => error.code === 'PLAYER_ALREADY_EXISTS')).toBeTrue();
  });

  it('moves player from general to main list', () => {
    const state = createInitialMapState();

    addPlayerToGeneralList(state, {
      id: 'p1',
      name: 'Player 1',
      power: 123,
      targetGeneralList: 'trap1General',
    });

    const moveResult = movePlayerBetweenLists(state, 'p1', 'trap1Main');

    expect(moveResult.ok).toBeTrue();
    expect(state.players.trap1General.length).toBe(0);
    expect(state.players.trap1Main.length).toBe(1);
  });

  it('blocks move to full main list', () => {
    const state = createInitialMapState();

    for (let i = 0; i < 8; i += 1) {
      addPlayerToGeneralList(state, {
        id: `p${i}`,
        name: `Player ${i}`,
        power: i,
        targetGeneralList: 'trap1General',
      });
      movePlayerBetweenLists(state, `p${i}`, 'trap1Main');
    }

    addPlayerToGeneralList(state, {
      id: 'p9',
      name: 'Player 9',
      power: 999,
      targetGeneralList: 'trap1General',
    });

    const moveToFull = movePlayerBetweenLists(state, 'p9', 'trap1Main');

    expect(moveToFull.ok).toBeFalse();
    expect(moveToFull.errors.some((error) => error.code === 'PLAYER_LIST_FULL')).toBeTrue();
  });
});
