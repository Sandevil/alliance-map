import { Injectable, computed, inject, signal } from '@angular/core';

import { MapState, createInitialMapState } from '../domain';
import { MAP_DATA_REPOSITORY } from '../state/data/map-data.tokens';
import { MapDataRepository } from '../state/data/map-data.repository';

@Injectable({ providedIn: 'root' })
export class MapViewFacade {
  private readonly dataRepository = inject(MAP_DATA_REPOSITORY) as MapDataRepository;

  private readonly stateSignal = signal(createInitialMapState());

  readonly query = signal('');
  readonly selectedPlayerId = signal<string | null>(null);

  readonly state = computed(() => this.stateSignal());

  constructor() {
    void this.reloadPublishedState();
  }

  readonly cityResults = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return [];
    }

    const playersById = new Map(this.getAllPlayers().map((player) => [player.id, player]));

    return this.state()
      .placements
      .filter((placement) => placement.type === 'city' && placement.playerId)
      .map((placement) => {
        const player = playersById.get(placement.playerId!);
        return {
          playerId: placement.playerId!,
          playerName: player?.name ?? placement.playerId!,
          playerPower: player?.power ?? 0,
          origin: placement.origin,
        };
      })
      .filter((item) => item.playerName.toLowerCase().includes(query));
  });

  updateQuery(value: string): void {
    this.query.set(value);
    if (!value.trim()) {
      this.selectedPlayerId.set(null);
    }
  }

  selectPlayer(playerId: string): void {
    this.selectedPlayerId.set(playerId);
  }

  async reloadPublishedState(): Promise<void> {
    const publishedState = await this.dataRepository.loadCurrentState('default', 'published');
    this.stateSignal.set(this.normalizeLegacyPlayerLists(publishedState ?? createInitialMapState()));
  }

  async reloadPublishedVariantState(variantKey: string): Promise<void> {
    const variantState = await this.dataRepository.loadPublishedVariantState('default', variantKey);
    this.stateSignal.set(this.normalizeLegacyPlayerLists(variantState ?? createInitialMapState()));
  }

  resetUiState(): void {
    this.query.set('');
    this.selectedPlayerId.set(null);
  }

  private getAllPlayers() {
    const state = this.state();
    return [
      ...(Array.isArray(state.players?.trap1Main) ? state.players.trap1Main : []),
      ...(Array.isArray(state.players?.trap2Main) ? state.players.trap2Main : []),
      ...(Array.isArray(state.players?.trap1General) ? state.players.trap1General : []),
      ...(Array.isArray(state.players?.trap2General) ? state.players.trap2General : []),
      ...(Array.isArray(state.players?.noTrapGeneral) ? state.players.noTrapGeneral : []),
    ];
  }

  private normalizeLegacyPlayerLists(state: MapState): MapState {
    const normalized = structuredClone(state);

    const players = normalized.players as Partial<MapState['players']>;
    if (!Array.isArray(players.trap1Main)) {
      players.trap1Main = [];
    }
    if (!Array.isArray(players.trap2Main)) {
      players.trap2Main = [];
    }
    if (!Array.isArray(players.trap1General)) {
      players.trap1General = [];
    }
    if (!Array.isArray(players.trap2General)) {
      players.trap2General = [];
    }
    if (!Array.isArray(players.noTrapGeneral)) {
      players.noTrapGeneral = [];
    }

    normalized.players = players as MapState['players'];
    return normalized;
  }
}
