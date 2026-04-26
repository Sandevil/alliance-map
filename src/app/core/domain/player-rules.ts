import { MAIN_LIST_MAX_PLAYERS } from './rules.constants';
import {
  GeneralPlayerListKey,
  MainPlayerListKey,
  MapState,
  Player,
  PlayerInput,
  PlayerListKey,
  RuleValidationResult,
} from './models';

export function validatePlayerInput(input: PlayerInput): RuleValidationResult {
  if (!input.name.trim()) {
    return errorResult('INVALID_PLAYER_NAME', 'Player name is required.');
  }

  if (!Number.isFinite(input.power) || input.power < 0) {
    return errorResult('INVALID_PLAYER_POWER', 'Player power must be a non-negative number.');
  }

  return okResult();
}

export function addPlayerToGeneralList(state: MapState, input: PlayerInput): RuleValidationResult {
  const inputValidation = validatePlayerInput(input);
  if (!inputValidation.ok) {
    return inputValidation;
  }

  const duplicate = findPlayerLocation(state, input.id);
  if (duplicate) {
    return errorResult('PLAYER_ALREADY_EXISTS', `Player ${input.id} already exists in ${duplicate}.`);
  }

  const player: Player = {
    id: input.id,
    name: input.name,
    power: input.power,
    homeGeneralList: input.targetGeneralList,
  };

  state.players[input.targetGeneralList] = [...state.players[input.targetGeneralList], player];
  return okResult();
}

export function movePlayerBetweenLists(state: MapState, playerId: string, to: PlayerListKey): RuleValidationResult {
  const from = findPlayerLocation(state, playerId);
  if (!from) {
    return errorResult('PLAYER_NOT_FOUND', `Player ${playerId} not found.`);
  }

  if (from === to) {
    return okResult();
  }

  const duplicateInDestination = state.players[to].some((player) => player.id === playerId);
  if (duplicateInDestination) {
    return errorResult('PLAYER_DUPLICATED', `Player ${playerId} is already in ${to}.`);
  }

  if (isMainList(to) && state.players[to].length >= MAIN_LIST_MAX_PLAYERS) {
    return errorResult('PLAYER_LIST_FULL', `List ${to} is full (${MAIN_LIST_MAX_PLAYERS}).`);
  }

  const player = state.players[from].find((item) => item.id === playerId);
  if (!player) {
    return errorResult('PLAYER_NOT_FOUND', `Player ${playerId} not found in ${from}.`);
  }

  state.players[from] = state.players[from].filter((item) => item.id !== playerId);
  state.players[to] = [...state.players[to], player];

  return okResult();
}

export function returnPlayerToHomeGeneralList(state: MapState, playerId: string): RuleValidationResult {
  const from = findPlayerLocation(state, playerId);
  if (!from) {
    return errorResult('PLAYER_NOT_FOUND', `Player ${playerId} not found.`);
  }

  const player = state.players[from].find((item) => item.id === playerId);
  if (!player) {
    return errorResult('PLAYER_NOT_FOUND', `Player ${playerId} not found in ${from}.`);
  }

  return movePlayerBetweenLists(state, playerId, player.homeGeneralList);
}

export function findPlayerLocation(state: MapState, playerId: string): PlayerListKey | null {
  const keys: PlayerListKey[] = ['trap1Main', 'trap2Main', 'trap1General', 'trap2General'];

  for (const key of keys) {
    const found = state.players[key].some((player) => player.id === playerId);
    if (found) {
      return key;
    }
  }

  return null;
}

export function isMainList(list: PlayerListKey): list is MainPlayerListKey {
  return list === 'trap1Main' || list === 'trap2Main';
}

export function isGeneralList(list: PlayerListKey): list is GeneralPlayerListKey {
  return list === 'trap1General' || list === 'trap2General';
}

function okResult(): RuleValidationResult {
  return { ok: true, errors: [] };
}

function errorResult(code: RuleValidationResult['errors'][number]['code'], message: string): RuleValidationResult {
  return { ok: false, errors: [{ code, message }] };
}
