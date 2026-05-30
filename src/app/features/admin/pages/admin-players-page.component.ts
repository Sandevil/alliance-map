import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MAIN_LIST_MAX_PLAYERS, MapState, PlayerListKey, RuleValidationError } from '../../../core/domain';
import { MapStateService } from '../../../core/state/map-state.service';

type SortKey = 'name' | 'power' | 'currentList';
type SortDirection = 'asc' | 'desc';

type PlayerEditorRow = {
  id: string;
  name: string;
  power: number;
  currentList: PlayerListKey;
  homeGeneralList: PlayerListKey;
  originalName: string;
  originalPower: number;
  originalCurrentList: PlayerListKey;
  error: string | null;
};

const PLAYER_LIST_ORDER: PlayerListKey[] = ['trap1Main', 'trap1General', 'trap2Main', 'trap2General', 'noTrapGeneral'];

@Component({
  selector: 'app-admin-players-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-players-page.component.html',
  styleUrl: './admin-players-page.component.scss',
})
export class AdminPlayersPageComponent {
  private readonly mapStateService = inject(MapStateService);

  readonly state = toSignal(this.mapStateService.state$, {
    initialValue: this.mapStateService.snapshot,
  });

  readonly rows = signal<PlayerEditorRow[]>([]);
  readonly isSaving = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly sort = signal<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });

  readonly playerListOptions = PLAYER_LIST_ORDER;

  readonly hasUnsavedChanges = computed(() => this.rows().some((row) => this.isRowDirty(row)));

  readonly sortedRows = computed(() => {
    const { key, direction } = this.sort();
    const sign = direction === 'asc' ? 1 : -1;

    return [...this.rows()].sort((a, b) => {
      let comparison = 0;

      if (key === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      } else if (key === 'power') {
        const aPower = Number.isFinite(a.power) ? a.power : Number.POSITIVE_INFINITY;
        const bPower = Number.isFinite(b.power) ? b.power : Number.POSITIVE_INFINITY;
        comparison = aPower - bPower;
      } else {
        comparison = this.getListWeight(a.currentList) - this.getListWeight(b.currentList);
      }

      if (comparison === 0) {
        comparison = a.id.localeCompare(b.id, undefined, { sensitivity: 'base' });
      }

      return comparison * sign;
    });
  });

  private suspendAutoSync = false;

  constructor() {
    effect(() => {
      const players = this.state().players;
      if (this.suspendAutoSync) {
        return;
      }

      this.rows.set(this.buildRowsFromState(players));
    });
  }

  setSort(key: SortKey): void {
    const current = this.sort();
    if (current.key === key) {
      this.sort.set({
        key,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      });
      return;
    }

    this.sort.set({ key, direction: 'asc' });
  }

  sortIndicator(key: SortKey): string {
    const current = this.sort();
    if (current.key !== key) {
      return '↕';
    }

    return current.direction === 'asc' ? '↑' : '↓';
  }

  updateRowName(playerId: string, value: string): void {
    this.suspendAutoSync = true;
    this.feedback.set(null);

    this.rows.update((rows) =>
      rows.map((row) =>
        row.id === playerId
          ? {
              ...row,
              name: value,
              error: null,
            }
          : row,
      ),
    );
  }

  updateRowPower(playerId: string, value: number | string | null): void {
    this.suspendAutoSync = true;
    this.feedback.set(null);

    const parsed = typeof value === 'number' ? value : Number(value);

    this.rows.update((rows) =>
      rows.map((row) =>
        row.id === playerId
          ? {
              ...row,
              power: parsed,
              error: null,
            }
          : row,
      ),
    );
  }

  updateRowCurrentList(playerId: string, value: string): void {
    if (!this.isPlayerListKey(value)) {
      return;
    }

    this.suspendAutoSync = true;
    this.feedback.set(null);

    this.rows.update((rows) =>
      rows.map((row) =>
        row.id === playerId
          ? {
              ...row,
              currentList: value,
              error: null,
            }
          : row,
      ),
    );
  }

  deletePlayer(playerId: string): void {
    const result = this.mapStateService.removePlayer(playerId);
    if (!result.ok) {
      this.feedback.set(this.formatErrors(result.errors));
      return;
    }

    this.rows.update((rows) => rows.filter((row) => row.id !== playerId));
    this.feedback.set('Player deleted.');
  }

  discardChanges(): void {
    this.suspendAutoSync = false;
    this.rows.set(this.buildRowsFromState(this.state().players));
    this.feedback.set('Changes discarded.');
  }

  saveAll(): void {
    if (this.isSaving()) {
      return;
    }

    const nextRows: PlayerEditorRow[] = this.rows().map((row) => ({ ...row, error: null }));
    const changedRows = nextRows.filter((row) => this.isRowDirty(row));

    if (!changedRows.length) {
      this.feedback.set('No pending player changes.');
      return;
    }

    this.isSaving.set(true);

    try {
      const rowErrors = new Map<string, string[]>();

      const addRowError = (playerId: string, message: string) => {
        const current = rowErrors.get(playerId) ?? [];
        rowErrors.set(playerId, [...current, message]);
      };

      const moveRows = this.orderMoveRows(changedRows.filter((row) => row.currentList !== row.originalCurrentList));
      for (const row of moveRows) {
        const moveResult = this.mapStateService.movePlayer(row.id, row.currentList);
        if (!moveResult.ok) {
          addRowError(row.id, this.formatErrors(moveResult.errors));
          continue;
        }

        row.originalCurrentList = row.currentList;
      }

      const updateRows = changedRows.filter((row) => row.name.trim() !== row.originalName || row.power !== row.originalPower);
      for (const row of updateRows) {
        const nextName = row.name.trim();
        const updateResult = this.mapStateService.updatePlayer(row.id, {
          name: nextName,
          power: row.power,
        });

        if (!updateResult.ok) {
          addRowError(row.id, this.formatErrors(updateResult.errors));
          continue;
        }

        row.name = nextName;
        row.originalName = nextName;
        row.originalPower = row.power;
      }

      for (const row of changedRows) {
        row.error = rowErrors.get(row.id)?.join(' ') ?? null;
      }

      const errorRowsCount = changedRows.filter((row) => !!row.error).length;
      const savedRowsCount = changedRows.length - errorRowsCount;

      if (errorRowsCount === 0) {
        this.suspendAutoSync = false;
        this.rows.set(this.buildRowsFromState(this.state().players));
        this.feedback.set(`Saved ${savedRowsCount} rows.`);
        return;
      }

      this.suspendAutoSync = true;
      this.rows.set(nextRows);
      this.feedback.set(`Saved ${savedRowsCount} rows. ${errorRowsCount} rows need review.`);
    } finally {
      this.isSaving.set(false);
    }
  }

  resetPlayerPositionsFromMap(): void {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('This will remove all player town positions from the map. Continue?');
      if (!confirmed) {
        return;
      }
    }

    const summary = this.mapStateService.clearPlayerPlacementsFromMap();
    this.feedback.set(
      summary.removedCount > 0
        ? `Removed ${summary.removedCount} player positions from map.`
        : 'No player positions found on map.',
    );
  }

  isRowDirty(row: PlayerEditorRow): boolean {
    return row.name.trim() !== row.originalName || row.power !== row.originalPower || row.currentList !== row.originalCurrentList;
  }

  getListTitle(list: PlayerListKey): string {
    switch (list) {
      case 'trap1Main':
        return `Trap 1 Main (max ${MAIN_LIST_MAX_PLAYERS})`;
      case 'trap2Main':
        return `Trap 2 Main (max ${MAIN_LIST_MAX_PLAYERS})`;
      case 'trap1General':
        return 'Trap 1 General';
      case 'trap2General':
        return 'Trap 2 General';
      case 'noTrapGeneral':
        return 'No Trap General';
      default:
        return list;
    }
  }

  private buildRowsFromState(players: MapState['players']): PlayerEditorRow[] {
    const rows: PlayerEditorRow[] = [];
    const seenIds = new Set<string>();

    for (const list of PLAYER_LIST_ORDER) {
      for (const player of players[list]) {
        if (seenIds.has(player.id)) {
          continue;
        }

        seenIds.add(player.id);
        rows.push({
          id: player.id,
          name: player.name,
          power: player.power,
          currentList: list,
          homeGeneralList: player.homeGeneralList,
          originalName: player.name,
          originalPower: player.power,
          originalCurrentList: list,
          error: null,
        });
      }
    }

    return rows;
  }

  private orderMoveRows(rows: PlayerEditorRow[]): PlayerEditorRow[] {
    return [...rows].sort((a, b) => this.getMovePriority(a) - this.getMovePriority(b));
  }

  private getMovePriority(row: PlayerEditorRow): number {
    const fromMain = this.isMainList(row.originalCurrentList);
    const toMain = this.isMainList(row.currentList);

    if (fromMain && !toMain) {
      return 0;
    }

    if (!fromMain && !toMain) {
      return 1;
    }

    if (fromMain && toMain) {
      return 2;
    }

    return 3;
  }

  private getListWeight(list: PlayerListKey): number {
    return PLAYER_LIST_ORDER.indexOf(list);
  }

  private isMainList(list: PlayerListKey): boolean {
    return list === 'trap1Main' || list === 'trap2Main';
  }

  private isPlayerListKey(value: string): value is PlayerListKey {
    return PLAYER_LIST_ORDER.includes(value as PlayerListKey);
  }

  private formatErrors(errors: RuleValidationError[]): string {
    return errors.map((error) => error.message).join(' ');
  }
}
