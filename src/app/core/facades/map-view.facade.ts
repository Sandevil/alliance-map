import { Injectable, computed, inject, signal } from '@angular/core';

import { createInitialMapState } from '../domain';
import { MAP_DATA_REPOSITORY } from '../state/data/map-data.tokens';
import { MapDataRepository } from '../state/data/map-data.repository';
import { MapStateService } from '../state/map-state.service';

@Injectable({ providedIn: 'root' })
export class MapViewFacade {
  private readonly mapStateService = inject(MapStateService);
  private readonly dataRepository = inject(MAP_DATA_REPOSITORY) as MapDataRepository;

  private readonly stateSignal = signal(this.mapStateService.snapshot ?? createInitialMapState());

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
    this.stateSignal.set(publishedState ?? this.mapStateService.snapshot);
  }

  private getAllPlayers() {
    const state = this.state();
    return [
      ...state.players.trap1Main,
      ...state.players.trap2Main,
      ...state.players.trap1General,
      ...state.players.trap2General,
    ];
  }
}
