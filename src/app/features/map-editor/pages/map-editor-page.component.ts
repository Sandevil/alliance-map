import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragMove, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import { TranslocoPipe } from '@jsverse/transloco';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  GRID_MIN_SIZE,
  GeneralPlayerListKey,
  MapState,
  MAIN_LIST_MAX_PLAYERS,
  Player,
  PlayerListKey,
  ResizeAnchor,
  TILE_RULES,
  TilePlacement,
  TileType,
  toExternal,
} from '../../../core/domain';
import { AdminSessionService } from '../../../core/auth/admin-session.service';
import { MapStateService } from '../../../core/state/map-state.service';
import { MapStateRevisionSummary, PublishedMapVariantSummary } from '../../../core/state/data/map-data.models';
import { MapLegendComponent } from '../../../shared/components/map-legend/map-legend.component';

type DragPlayerData = {
  kind: 'player';
  playerId: string;
  from: PlayerListKey;
};

type DragTileData = {
  kind: 'tile';
  tileType: TileType;
};

type DragPlacementData = {
  kind: 'placement';
  placementId: string;
};

type DragData = DragPlayerData | DragTileData | DragPlacementData;

type PanelOpenState = Record<PlayerListKey, boolean>;
type PanelSearchState = Record<PlayerListKey, string>;

type MapEditorUiPreferences = {
  version: 1;
  tileCatalogOpen: boolean;
  playerListOrder: PlayerListKey[];
  panelOpenState: PanelOpenState;
  panelSearchState: PanelSearchState;
};

const TILE_EXPORT_COLORS = {
  banner: 'rgba(99, 102, 241, 0.82)',
  allianceResource: 'rgba(16, 185, 129, 0.82)',
  bearTrap1: 'rgba(14, 165, 233, 0.75)',
  bearTrap2: 'rgba(14, 165, 233, 0.75)',
  fortress: 'rgba(168, 85, 247, 0.85)',
} as const;

const CITY_TRAP1_COLOR = 'rgba(132, 204, 22, 0.85)';
const CITY_TRAP1_GENERAL_COLOR = 'rgba(112, 163, 46, 0.82)';
const CITY_TRAP2_COLOR = 'rgba(249, 115, 22, 0.85)';
const CITY_TRAP2_GENERAL_COLOR = 'rgba(219, 116, 48, 0.82)';
const CITY_NO_TRAP_GENERAL_COLOR = 'rgba(234, 179, 8, 0.85)';
const UI_PREFS_STORAGE_KEY = 'map-editor-ui:v1';
const DEFAULT_PLAYER_LIST_ORDER: PlayerListKey[] = ['trap1Main', 'trap1General', 'trap2Main', 'trap2General', 'noTrapGeneral'];

@Component({
  selector: 'app-map-editor-page',
  imports: [CommonModule, TranslocoPipe, FormsModule, CdkDropListGroup, CdkDropList, CdkDrag, CdkDragHandle, MapLegendComponent],
  templateUrl: './map-editor-page.component.html',
  styleUrl: './map-editor-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEditorPageComponent implements AfterViewInit, OnDestroy {
  private readonly mapStateService = inject(MapStateService);
  private readonly adminSessionService = inject(AdminSessionService);
  private readonly router = inject(Router);
  readonly GRID_MIN_SIZE = GRID_MIN_SIZE;

  @ViewChild('panzoomHost')
  private panzoomHost?: ElementRef<HTMLElement>;

  @ViewChild('gridElement')
  private gridElement?: ElementRef<HTMLElement>;

  @ViewChild('boardViewport')
  private boardViewport?: ElementRef<HTMLElement>;

  @ViewChild('configFileInput')
  private configFileInput?: ElementRef<HTMLInputElement>;

  @ViewChild('playersFileInput')
  private playersFileInput?: ElementRef<HTMLInputElement>;

  readonly state = toSignal(this.mapStateService.state$, {
    initialValue: this.mapStateService.snapshot,
  });

  readonly TILE_RULES = TILE_RULES;

  readonly tileCatalog: TileType[] = [
    'banner',
    'city',
    'allianceResource',
    'bearTrap1',
    'bearTrap2',
    'fortress',
  ];

  readonly playerLists = signal<PlayerListKey[]>([...DEFAULT_PLAYER_LIST_ORDER]);

  readonly connectedDropLists = [
    'tile-catalog-drop',
    'trap1General',
    'trap2General',
    'noTrapGeneral',
    'trap1Main',
    'trap2Main',
    'map-grid-drop',
  ];

  readonly hoveredCell = signal<{ x: number; y: number } | null>(null);
  readonly feedback = signal<string | null>(null);
  readonly isSidebarOpen = signal(true);
  readonly isTileCatalogOpen = signal(false);
  readonly panelOpenState = signal<PanelOpenState>({
    trap1Main: true,
    trap1General: true,
    trap2Main: true,
    trap2General: true,
    noTrapGeneral: true,
  });
  readonly panelSearchState = signal<PanelSearchState>({
    trap1Main: '',
    trap1General: '',
    trap2Main: '',
    trap2General: '',
    noTrapGeneral: '',
  });
  readonly isAddPlayerDialogOpen = signal(false);
  readonly isResizeDialogOpen = signal(false);
  readonly isExternalReferenceDialogOpen = signal(false);
  readonly isSettingsMenuOpen = signal(false);
  readonly isPublishing = signal(false);
  readonly isHistoryDialogOpen = signal(false);
  readonly isHistoryLoading = signal(false);
  readonly restoringRevisionId = signal<string | null>(null);
  readonly publishedHistory = signal<MapStateRevisionSummary[]>([]);
  readonly isVariantDialogOpen = signal(false);
  readonly isVariantPublishing = signal(false);
  readonly publishedVariants = signal<PublishedMapVariantSummary[]>([]);
  readonly editingPlayerId = signal<string | null>(null);

  readonly gridCells = computed(() => {
    const grid = this.state().settings.grid;
    const cells: { x: number; y: number; key: string }[] = [];

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        cells.push({ x, y, key: `${x}:${y}` });
      }
    }

    return cells;
  });

  readonly gridStyle = computed(() => {
    const grid = this.state().settings.grid;
    return {
      '--grid-width': `${grid.width}`,
      '--grid-height': `${grid.height}`,
    };
  });

  readonly claimedCells = computed(() => this.buildClaimedCells(this.state()));
  readonly claimedCellClassMap = computed(() => this.buildClaimedBorderClassMap(this.claimedCells()));

  playerName = '';
  playerPower = 0;
  playerTargetGeneralList: GeneralPlayerListKey = 'noTrapGeneral';
  resizeWidth = this.mapStateService.snapshot.settings.grid.width;
  resizeHeight = this.mapStateService.snapshot.settings.grid.height;
  resizeAnchor: ResizeAnchor = 'top-left';
  externalAnchorInternalX = this.mapStateService.snapshot.settings.externalReference.anchorInternal.x;
  externalAnchorInternalY = this.mapStateService.snapshot.settings.externalReference.anchorInternal.y;
  externalAnchorExternalX = this.mapStateService.snapshot.settings.externalReference.anchorExternal.x;
  externalAnchorExternalY = this.mapStateService.snapshot.settings.externalReference.anchorExternal.y;
  variantKeyInput = '';
  variantLabelInput = '';

  private panzoom?: PanzoomObject;
  private initialPanTimeoutId?: number;
  private readonly wheelHandler = (event: WheelEvent) => {
    this.panzoom?.zoomWithWheel(event);
  };

  constructor() {
    this.restoreUiPreferences();
  }

  ngAfterViewInit(): void {
    if (!this.panzoomHost) {
      return;
    }

    this.panzoom = Panzoom(this.panzoomHost.nativeElement, {
      minScale: 0.1,
      maxScale: 2.5,
      step: 0.2,
      excludeClass: 'panzoom-exclude',
    });

    this.panzoomHost.nativeElement.parentElement?.addEventListener('wheel', this.wheelHandler);
    this.scheduleInitialBoardPan();
  }

  ngOnDestroy(): void {
    if (this.initialPanTimeoutId) {
      window.clearTimeout(this.initialPanTimeoutId);
    }

    this.panzoomHost?.nativeElement.parentElement?.removeEventListener('wheel', this.wheelHandler);
    this.panzoom?.destroy();
  }

  addPlayer(): void {
    const editingId = this.editingPlayerId();
    const result = editingId
      ? this.mapStateService.updatePlayer(editingId, {
          name: this.playerName,
          power: this.playerPower,
        })
      : this.mapStateService.addPlayer({
          id: `p-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          name: this.playerName,
          power: this.playerPower,
          targetGeneralList: this.playerTargetGeneralList,
        });

    if (!result.ok) {
      this.feedback.set(this.describeErrors(result.errors.map((error) => error.code)));
      return;
    }

    this.feedback.set(null);
    this.editingPlayerId.set(null);
    this.playerName = '';
    this.playerPower = 0;
    this.closeAddPlayerDialog();
  }

  openEditPlayerDialog(player: Player): void {
    this.editingPlayerId.set(player.id);
    this.playerName = player.name;
    this.playerPower = player.power;
    this.openAddPlayerDialog();
  }

  removePlayer(playerId: string): void {
    const result = this.mapStateService.removePlayer(playerId);
    this.feedback.set(result.ok ? null : this.describeErrors(result.errors.map((error) => error.code)));
  }

  onPlayerListDrop(event: CdkDragDrop<PlayerListKey>): void {
    const dragData = event.item.data as DragData;
    if (dragData.kind !== 'player') {
      return;
    }

    const targetList = event.container.id as PlayerListKey;
    const result = this.mapStateService.movePlayer(dragData.playerId, targetList);

    this.feedback.set(result.ok ? null : this.describeErrors(result.errors.map((error) => error.code)));
  }

  onMapDrop(event: CdkDragDrop<string>): void {
    const dragData = event.item.data as DragData;
    const cell = this.resolveDropCell(event);

    if (!cell) {
      this.feedback.set('Select a target cell before dropping.');
      return;
    }

    if (dragData.kind === 'player') {
      const placement = {
        id: this.createPlacementId('city'),
        type: 'city' as const,
        origin: cell,
        size: TILE_RULES.city.size,
        playerId: dragData.playerId,
      };

      const result = this.mapStateService.addPlacement(placement);
      this.feedback.set(result.ok ? null : this.describeErrors(result.errors.map((error) => error.code)));
      event.item.reset();
      return;
    }

    if (dragData.kind === 'placement') {
      const result = this.mapStateService.movePlacement(dragData.placementId, cell);
      this.feedback.set(result.ok ? null : this.describeErrors(result.errors.map((error) => error.code)));
      event.item.reset();
      return;
    }

    const tileRule = TILE_RULES[dragData.tileType];
    const result = this.mapStateService.addPlacement({
      id: this.createPlacementId(dragData.tileType),
      type: dragData.tileType,
      origin: cell,
      size: tileRule.size,
    });

    this.feedback.set(result.ok ? null : this.describeErrors(result.errors.map((error) => error.code)));
    event.item.reset();
  }

  removePlacement(placementId: string): void {
    this.mapStateService.removePlacement(placementId);
  }

  setHoveredCell(x: number, y: number): void {
    this.hoveredCell.set({ x, y });
  }

  clearHoveredCell(): void {
    this.hoveredCell.set(null);
  }

  resetMapState(): void {
    this.mapStateService.reset();
    this.resizeWidth = this.state().settings.grid.width;
    this.resizeHeight = this.state().settings.grid.height;
    this.feedback.set(null);
  }

  applyGridResize(): boolean {
    const result = this.mapStateService.resizeGrid(this.resizeWidth, this.resizeHeight, this.resizeAnchor);
    if (!result.ok) {
      this.feedback.set(this.describeErrors(result.errors.map((error) => error.code)));
      return false;
    }

    this.resizeWidth = this.state().settings.grid.width;
    this.resizeHeight = this.state().settings.grid.height;
    this.feedback.set('Grid resized.');
    return true;
  }

  exportConfig(): void {
    const state = this.mapStateService.exportState();
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alliance-map-config-${Date.now()}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
    this.feedback.set('Configuration exported.');
  }

  openImportConfigDialog(): void {
    this.configFileInput?.nativeElement.click();
  }

  openImportPlayersDialog(): void {
    this.playersFileInput?.nativeElement.click();
  }

  async onImportConfigSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      const result = this.mapStateService.importState(parsed);

      this.feedback.set(result.ok ? 'Configuration imported.' : this.describeErrors(result.errors.map((error) => error.code)));
    } catch {
      this.feedback.set('Invalid JSON file.');
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  async onImportPlayersSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const players = this.parsePlayersPayload(content, file.name);
      if (!players.length) {
        this.feedback.set('No players found in import file.');
        return;
      }

      const result = this.mapStateService.upsertPlayersByName(players);
      if (!result.ok) {
        this.feedback.set(this.describeErrors(result.errors.map((error) => error.code)));
        return;
      }

      this.feedback.set(
        `Players import completed. Created: ${result.summary.created}, Updated: ${result.summary.updated}, Skipped: ${result.summary.skipped}.`,
      );
    } catch {
      this.feedback.set('Invalid players import file.');
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  async exportMapPng(): Promise<void> {
    try {
      const state = this.state();
      const cellSize = 24;
      const cellGap = 1;
      const mapWidth = state.settings.grid.width * cellSize + (state.settings.grid.width - 1) * cellGap;
      const mapHeight = state.settings.grid.height * cellSize + (state.settings.grid.height - 1) * cellGap;
      const skewRadians = (24 * Math.PI) / 180;
      const skewX = Math.tan(skewRadians);
      const skewOffsetX = Math.ceil(skewX * mapHeight);
      const padding = 16;

      const exportWidth = Math.max(mapWidth + skewOffsetX + padding * 2, 1);
      const exportHeight = Math.max(mapHeight + padding * 2, 1);

      const canvas = document.createElement('canvas');
      canvas.width = exportWidth * 2;
      canvas.height = exportHeight * 2;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.feedback.set('PNG export failed.');
        return;
      }

      ctx.scale(2, 2);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, exportWidth, exportHeight);

      ctx.save();
      ctx.translate(skewOffsetX + padding, padding);
      ctx.transform(1, 0, -skewX, 1, 0, 0);

      ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;

      for (let y = 0; y < state.settings.grid.height; y += 1) {
        for (let x = 0; x < state.settings.grid.width; x += 1) {
          const originX = x * (cellSize + cellGap);
          const originY = y * (cellSize + cellGap);
          ctx.fillRect(originX, originY, cellSize, cellSize);
          ctx.strokeRect(originX, originY, cellSize, cellSize);
        }
      }

      for (const placement of state.placements) {
        const x = placement.origin.x * (cellSize + cellGap);
        const y = placement.origin.y * (cellSize + cellGap);
        const w = placement.size.w * cellSize + (placement.size.w - 1) * cellGap;
        const h = placement.size.h * cellSize + (placement.size.h - 1) * cellGap;

        const fillColor =
          placement.type === 'city'
            ? this.getCityColorByPlayerId(placement.playerId)
            : TILE_EXPORT_COLORS[placement.type];

        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#0b1220';
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#0b1220';
        ctx.font = '10px Arial';
        ctx.textBaseline = 'top';

        const label = placement.type === 'city' && placement.playerId
          ? `${this.getPlayerNameById(placement.playerId)} ${this.getPlayerPowerById(placement.playerId)}`
          : this.getTileLabel(placement.type);
        ctx.fillText(label, x + 3, y + 3, Math.max(w - 6, 8));
      }

      ctx.restore();

      const dataUrl = canvas.toDataURL('image/png');

      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `alliance-map-${Date.now()}.png`;
      anchor.click();
      this.feedback.set('PNG exported.');
    } catch {
      this.feedback.set('PNG export failed.');
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update((value) => !value);
  }

  toggleSettingsMenu(): void {
    this.isSettingsMenuOpen.update((value) => !value);
  }

  closeSettingsMenu(): void {
    this.isSettingsMenuOpen.set(false);
  }

  openResizeDialog(): void {
    this.resizeWidth = this.state().settings.grid.width;
    this.resizeHeight = this.state().settings.grid.height;
    this.isResizeDialogOpen.set(true);
  }

  openResizeDialogFromSettings(): void {
    this.closeSettingsMenu();
    this.openResizeDialog();
  }

  closeResizeDialog(): void {
    this.isResizeDialogOpen.set(false);
  }

  applyGridResizeFromDialog(): void {
    if (this.applyGridResize()) {
      this.closeResizeDialog();
    }
  }

  openExternalReferenceDialog(): void {
    const reference = this.state().settings.externalReference;
    this.externalAnchorInternalX = reference.anchorInternal.x;
    this.externalAnchorInternalY = reference.anchorInternal.y;
    this.externalAnchorExternalX = reference.anchorExternal.x;
    this.externalAnchorExternalY = reference.anchorExternal.y;
    this.isExternalReferenceDialogOpen.set(true);
  }

  openExternalReferenceDialogFromSettings(): void {
    this.closeSettingsMenu();
    this.openExternalReferenceDialog();
  }

  closeExternalReferenceDialog(): void {
    this.isExternalReferenceDialogOpen.set(false);
  }

  applyExternalReferenceFromDialog(): void {
    const result = this.mapStateService.updateExternalReference(
      { x: this.externalAnchorInternalX, y: this.externalAnchorInternalY },
      { x: this.externalAnchorExternalX, y: this.externalAnchorExternalY },
    );

    if (!result.ok) {
      this.feedback.set(this.describeErrors(result.errors.map((error) => error.code)));
      return;
    }

    this.feedback.set('External reference updated.');
    this.closeExternalReferenceDialog();
  }

  exportConfigFromSettings(): void {
    this.closeSettingsMenu();
    this.exportConfig();
  }

  openImportConfigDialogFromSettings(): void {
    this.closeSettingsMenu();
    this.openImportConfigDialog();
  }

  openImportPlayersDialogFromSettings(): void {
    this.closeSettingsMenu();
    this.openImportPlayersDialog();
  }

  exportMapPngFromSettings(): void {
    this.closeSettingsMenu();
    void this.exportMapPng();
  }

  resetMapStateFromSettings(): void {
    this.closeSettingsMenu();
    this.resetMapState();
  }

  async publishMapFromSettings(): Promise<void> {
    if (this.isPublishing()) {
      return;
    }

    this.closeSettingsMenu();
    this.isPublishing.set(true);

    try {
      const published = await this.mapStateService.publishCurrentState('Manual publish from settings');
      this.feedback.set(published ? 'Draft published.' : 'No draft available to publish.');
    } catch {
      this.feedback.set('Publish failed.');
    } finally {
      this.isPublishing.set(false);
    }
  }

  async openHistoryDialogFromSettings(): Promise<void> {
    this.closeSettingsMenu();
    this.isHistoryDialogOpen.set(true);
    await this.reloadPublishedHistory();
  }

  async openVariantDialogFromSettings(): Promise<void> {
    this.closeSettingsMenu();
    this.isVariantDialogOpen.set(true);
    await this.reloadPublishedVariants();
  }

  closeVariantDialog(): void {
    this.isVariantDialogOpen.set(false);
  }

  async publishVariantFromDialog(): Promise<void> {
    const key = this.variantKeyInput.trim().toLowerCase();
    if (!key || this.isVariantPublishing()) {
      return;
    }

    this.isVariantPublishing.set(true);
    try {
      const ok = await this.mapStateService.publishCurrentStateAsVariant(key, this.variantLabelInput.trim() || undefined);
      this.feedback.set(ok ? `Variant published: ${key}` : 'Variant publish failed.');
      if (ok) {
        this.variantKeyInput = '';
        this.variantLabelInput = '';
        await this.reloadPublishedVariants();
      }
    } catch {
      this.feedback.set('Variant publish failed.');
    } finally {
      this.isVariantPublishing.set(false);
    }
  }

  async copyVariantLink(variantKey: string): Promise<void> {
    const url = `${window.location.origin}/map/v/${encodeURIComponent(variantKey)}`;
    try {
      await navigator.clipboard.writeText(url);
      this.feedback.set('Variant link copied.');
    } catch {
      this.feedback.set(url);
    }
  }

  closeHistoryDialog(): void {
    this.isHistoryDialogOpen.set(false);
  }

  async restoreRevisionToDraft(revisionId: string): Promise<void> {
    if (this.restoringRevisionId()) {
      return;
    }

    this.restoringRevisionId.set(revisionId);
    try {
      const restored = await this.mapStateService.restorePublishedRevisionToDraft(revisionId);
      this.feedback.set(restored ? 'Published revision restored to draft.' : 'Revision not found.');
      if (restored) {
        await this.reloadPublishedHistory();
        this.closeHistoryDialog();
      }
    } catch {
      this.feedback.set('Restore failed.');
    } finally {
      this.restoringRevisionId.set(null);
    }
  }

  isRestoringRevision(revisionId: string): boolean {
    return this.restoringRevisionId() === revisionId;
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  logoutAdmin(): void {
    this.adminSessionService.logout();
    void this.router.navigateByUrl('/');
  }

  toggleTileCatalog(): void {
    this.isTileCatalogOpen.update((value) => !value);
    this.persistUiPreferences();
  }

  togglePlayerPanel(key: PlayerListKey): void {
    this.panelOpenState.update((state) => ({
      ...state,
      [key]: !state[key],
    }));
    this.persistUiPreferences();
  }

  isPlayerPanelOpen(key: PlayerListKey): boolean {
    return this.panelOpenState()[key];
  }

  setPanelSearchValue(key: PlayerListKey, value: string): void {
    this.panelSearchState.update((state) => ({
      ...state,
      [key]: value,
    }));
    this.persistUiPreferences();
  }

  getPanelSearchValue(key: PlayerListKey): string {
    return this.panelSearchState()[key] ?? '';
  }

  onPlayerPanelsReorder(event: CdkDragDrop<PlayerListKey[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const nextOrder = [...this.playerLists()];
    moveItemInArray(nextOrder, event.previousIndex, event.currentIndex);
    this.playerLists.set(nextOrder);
    this.persistUiPreferences();
  }

  openAddPlayerDialog(): void {
    this.isAddPlayerDialogOpen.set(true);
  }

  closeAddPlayerDialog(): void {
    this.isAddPlayerDialogOpen.set(false);
    this.editingPlayerId.set(null);
    this.playerName = '';
    this.playerPower = 0;
  }

  zoomIn(): void {
    this.panzoom?.zoomIn();
  }

  zoomOut(): void {
    this.panzoom?.zoomOut();
  }

  resetZoom(): void {
    this.panzoom?.reset();
    this.scheduleInitialBoardPan();
  }

  fitZoom(): void {
    const viewport = this.boardViewport?.nativeElement;
    const grid = this.gridElement?.nativeElement;

    if (!this.panzoom || !viewport || !grid) {
      return;
    }

    const scaleByWidth = viewport.clientWidth / Math.max(grid.offsetWidth, 1);
    const scaleByHeight = viewport.clientHeight / Math.max(grid.offsetHeight, 1);
    const fitScale = Math.min(scaleByWidth, scaleByHeight) * 0.94;
    const clampedScale = Math.max(0.1, Math.min(2.5, fitScale));

    this.panzoom.zoom(clampedScale, { animate: false });
    this.panzoom.pan(0, 0, { animate: false });
  }

  trackByCell(_: number, cell: { key: string }): string {
    return cell.key;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  getPlayersByList(list: PlayerListKey): Player[] {
    return this.state().players[list];
  }

  getVisiblePlayersByList(list: PlayerListKey): Player[] {
    const term = this.getPanelSearchValue(list).trim().toLowerCase();
    if (!term) {
      return this.getPlayersByList(list);
    }

    return this.getPlayersByList(list).filter((player) => {
      const byName = player.name.toLowerCase().includes(term);
      const byPower = `${player.power}`.includes(term);
      return byName || byPower;
    });
  }

  getPlayerDragData(playerId: string, from: PlayerListKey): DragPlayerData {
    return {
      kind: 'player',
      playerId,
      from,
    };
  }

  getTileDragData(tileType: TileType): DragTileData {
    return {
      kind: 'tile',
      tileType,
    };
  }

  getPlacementDragData(placementId: string): DragPlacementData {
    return {
      kind: 'placement',
      placementId,
    };
  }

  getPlacementStyle(placement: TilePlacement): Record<string, string> {
    return {
      '--origin-x': `${placement.origin.x + 1}`,
      '--origin-y': `${placement.origin.y + 1}`,
      '--tile-w': `${placement.size.w}`,
      '--tile-h': `${placement.size.h}`,
    };
  }

  getCityTrapClass(placement: TilePlacement): string | null {
    if (placement.type !== 'city') {
      return null;
    }

    const playerList = this.getPlayerListById(placement.playerId);
    if (playerList === 'noTrapGeneral') {
      return 'grid__tile--city-no-trap-general';
    }
    if (playerList === 'trap2General') {
      return 'grid__tile--city-trap2-general';
    }
    if (playerList === 'trap2Main') {
      return 'grid__tile--city-trap2';
    }
    if (playerList === 'trap1General') {
      return 'grid__tile--city-trap1-general';
    }

    return 'grid__tile--city-trap1';
  }

  getTileLabel(type: TileType): string {
    switch (type) {
      case 'banner':
        return 'Banner';
      case 'city':
        return 'Town';
      case 'allianceResource':
        return 'Alliance Resource';
      case 'bearTrap1':
        return 'Bear Trap 1';
      case 'bearTrap2':
        return 'Bear Trap 2';
      case 'fortress':
        return 'Fortress';
      default:
        return type;
    }
  }

  getExternalCoordsLabel(x: number, y: number): string {
    const external = toExternal({ x, y }, this.state().settings.externalReference);
    return `${external.x}/${external.y}`;
  }

  getPlayerNameById(playerId?: string): string {
    const player = this.getPlayerById(playerId);
    return player?.name ?? playerId ?? '';
  }

  getPlayerPowerById(playerId?: string): number {
    const player = this.getPlayerById(playerId);
    return player?.power ?? 0;
  }

  isHoveredCell(x: number, y: number): boolean {
    const cell = this.hoveredCell();
    return !!cell && cell.x === x && cell.y === y;
  }

  isClaimedCell(x: number, y: number): boolean {
    return this.claimedCells().has(`${x}:${y}`);
  }

  onPlacementDragMoved(event: CdkDragMove<DragPlacementData>): void {
    const target = document.elementFromPoint(event.pointerPosition.x, event.pointerPosition.y) as HTMLElement | null;
    const cellElement = target?.closest('.grid__cell') as HTMLElement | null;

    if (cellElement?.dataset['x'] && cellElement.dataset['y']) {
      this.hoveredCell.set({
        x: Number(cellElement.dataset['x']),
        y: Number(cellElement.dataset['y']),
      });
      return;
    }

    this.hoveredCell.set(null);
  }

  isMainList(key: PlayerListKey): boolean {
    return key === 'trap1Main' || key === 'trap2Main';
  }

  getListTitle(key: PlayerListKey): string {
    switch (key) {
      case 'trap1General':
        return 'Trap 1 General';
      case 'trap2General':
        return 'Trap 2 General';
      case 'noTrapGeneral':
        return 'No Trap General';
      case 'trap1Main':
        return `Trap 1 Main (max ${MAIN_LIST_MAX_PLAYERS})`;
      case 'trap2Main':
        return `Trap 2 Main (max ${MAIN_LIST_MAX_PLAYERS})`;
      default:
        return key;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isExternalReferenceDialogOpen()) {
      this.closeExternalReferenceDialog();
      return;
    }

    if (this.isResizeDialogOpen()) {
      this.closeResizeDialog();
      return;
    }

    if (this.isAddPlayerDialogOpen()) {
      this.closeAddPlayerDialog();
      return;
    }

    if (this.isHistoryDialogOpen()) {
      this.closeHistoryDialog();
      return;
    }

    if (this.isVariantDialogOpen()) {
      this.closeVariantDialog();
      return;
    }

    if (this.isSettingsMenuOpen()) {
      this.closeSettingsMenu();
      return;
    }

    if (this.isSidebarOpen()) {
      this.closeSidebar();
    }
  }

  private createPlacementId(type: TileType): string {
    return `${type}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  }

  private applyInitialBoardPan(): void {
    if (!this.panzoom) {
      return;
    }

    const viewport = this.boardViewport?.nativeElement;
    const grid = this.gridElement?.nativeElement;

    if (!viewport || !grid) {
      return;
    }

    const centeredOffset = (viewport.clientWidth - grid.offsetWidth) / 2;
    const rightBias = 72;
    const obliqueCompensationFactor = 2;
    const panX = Math.max(16, (centeredOffset + rightBias) * obliqueCompensationFactor - viewport.clientWidth / 3);

    this.panzoom.pan(panX, 0, { animate: false });
  }

  private scheduleInitialBoardPan(): void {
    if (this.initialPanTimeoutId) {
      window.clearTimeout(this.initialPanTimeoutId);
    }

    this.applyInitialBoardPan();
    requestAnimationFrame(() => this.applyInitialBoardPan());
    this.initialPanTimeoutId = window.setTimeout(() => {
      this.applyInitialBoardPan();
    }, 240);
  }

  private resolveDropCell(event: CdkDragDrop<string>): { x: number; y: number } | null {
    const dropPoint = (event as CdkDragDrop<string> & { dropPoint?: { x: number; y: number } }).dropPoint;

    if (dropPoint) {
      const target = document.elementFromPoint(dropPoint.x, dropPoint.y) as HTMLElement | null;
      const cellElement = target?.closest('.grid__cell') as HTMLElement | null;

      if (cellElement?.dataset['x'] && cellElement.dataset['y']) {
        return {
          x: Number(cellElement.dataset['x']),
          y: Number(cellElement.dataset['y']),
        };
      }
    }

    return this.hoveredCell();
  }

  private getAllPlayers(): Player[] {
    const state = this.state();
    return [
      ...state.players.trap1Main,
      ...state.players.trap2Main,
      ...state.players.trap1General,
      ...state.players.trap2General,
      ...state.players.noTrapGeneral,
    ];
  }

  private getPlayerById(playerId?: string): Player | undefined {
    if (!playerId) {
      return undefined;
    }

    return this.getAllPlayers().find((item) => item.id === playerId);
  }

  private getCityColorByPlayerId(playerId?: string): string {
    const playerList = this.getPlayerListById(playerId);
    if (playerList === 'noTrapGeneral') {
      return CITY_NO_TRAP_GENERAL_COLOR;
    }
    if (playerList === 'trap2General') {
      return CITY_TRAP2_GENERAL_COLOR;
    }
    if (playerList === 'trap2Main') {
      return CITY_TRAP2_COLOR;
    }
    if (playerList === 'trap1General') {
      return CITY_TRAP1_GENERAL_COLOR;
    }

    return CITY_TRAP1_COLOR;
  }

  private getPlayerListById(playerId?: string): PlayerListKey | null {
    if (!playerId) {
      return null;
    }

    const players = this.state().players;
    const listKeys: PlayerListKey[] = ['trap1Main', 'trap2Main', 'trap1General', 'trap2General', 'noTrapGeneral'];

    for (const listKey of listKeys) {
      if (players[listKey].some((player) => player.id === playerId)) {
        return listKey;
      }
    }

    return null;
  }

  private describeErrors(codes: string[]): string {
    const labels: Record<string, string> = {
      OUT_OF_BOUNDS: 'Out of bounds.',
      COLLISION: 'Collision with an existing tile.',
      MAX_TILE_LIMIT_REACHED: 'Tile limit reached.',
      INVALID_CITY_PLAYER: 'Invalid player for town.',
      INVALID_TILE_SIZE: 'Invalid tile size.',
      GRID_TOO_SMALL: 'Grid too small.',
      PLAYER_ALREADY_EXISTS: 'Player already exists.',
      PLAYER_NOT_FOUND: 'Player not found.',
      PLAYER_LIST_FULL: 'Target list is full.',
      PLAYER_DUPLICATED: 'Player duplicated in destination list.',
      INVALID_PLAYER_NAME: 'Player name is required.',
      INVALID_PLAYER_POWER: 'Player power is invalid.',
      INVALID_SCHEMA_VERSION: 'Unsupported schema version.',
      INVALID_MAP_STATE: 'Invalid map state.',
    };

    return codes.map((code) => labels[code] ?? code).join(' ');
  }

  private async reloadPublishedHistory(): Promise<void> {
    this.isHistoryLoading.set(true);
    try {
      const history = await this.mapStateService.listPublishedHistory();
      this.publishedHistory.set(history);
    } finally {
      this.isHistoryLoading.set(false);
    }
  }

  private async reloadPublishedVariants(): Promise<void> {
    const variants = await this.mapStateService.listPublishedVariants();
    this.publishedVariants.set(variants);
  }

  private parsePlayersPayload(content: string, fileName: string): Array<{ name: string; power: number; targetGeneralList?: GeneralPlayerListKey }> {
    if (fileName.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => {
          const target = item['targetGeneralList'];
          const targetGeneralList: GeneralPlayerListKey =
            target === 'trap1General' || target === 'trap2General' || target === 'noTrapGeneral'
              ? target
              : 'noTrapGeneral';
          return {
            name: typeof item['name'] === 'string' ? item['name'] : '',
            power: typeof item['power'] === 'number' ? item['power'] : Number(item['power']),
            targetGeneralList,
          };
        });
    }

    const rows = content
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter((row) => row.length > 0);

    if (!rows.length) {
      return [];
    }

    const hasHeader = /^name\s*[,;]/i.test(rows[0]);
    const dataRows = hasHeader ? rows.slice(1) : rows;

    return dataRows.map((row) => {
      const [name = '', powerRaw = '0', listRaw = ''] = row.split(/[;,]/).map((value) => value.trim());
      const targetGeneralList: GeneralPlayerListKey =
        listRaw === 'trap1General' || listRaw === 'trap2General' || listRaw === 'noTrapGeneral'
          ? listRaw
          : 'noTrapGeneral';

      return {
        name,
        power: Number(powerRaw),
        targetGeneralList,
      };
    });
  }

  private persistUiPreferences(): void {
    const payload: MapEditorUiPreferences = {
      version: 1,
      tileCatalogOpen: this.isTileCatalogOpen(),
      playerListOrder: this.playerLists(),
      panelOpenState: this.panelOpenState(),
      panelSearchState: this.panelSearchState(),
    };

    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
  }

  private restoreUiPreferences(): void {
    try {
      const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<MapEditorUiPreferences>;
      const normalizedOrder = this.normalizePlayerListOrder(parsed.playerListOrder);
      this.playerLists.set(normalizedOrder);

      if (typeof parsed.tileCatalogOpen === 'boolean') {
        this.isTileCatalogOpen.set(parsed.tileCatalogOpen);
      }

      if (parsed.panelOpenState) {
        this.panelOpenState.set({
          trap1Main: parsed.panelOpenState.trap1Main ?? true,
          trap1General: parsed.panelOpenState.trap1General ?? true,
          trap2Main: parsed.panelOpenState.trap2Main ?? true,
          trap2General: parsed.panelOpenState.trap2General ?? true,
          noTrapGeneral: parsed.panelOpenState.noTrapGeneral ?? true,
        });
      }

      if (parsed.panelSearchState) {
        this.panelSearchState.set({
          trap1Main: parsed.panelSearchState.trap1Main ?? '',
          trap1General: parsed.panelSearchState.trap1General ?? '',
          trap2Main: parsed.panelSearchState.trap2Main ?? '',
          trap2General: parsed.panelSearchState.trap2General ?? '',
          noTrapGeneral: parsed.panelSearchState.noTrapGeneral ?? '',
        });
      }
    } catch {
      // ignore invalid ui prefs
    }
  }

  private normalizePlayerListOrder(value: unknown): PlayerListKey[] {
    if (!Array.isArray(value)) {
      return [...DEFAULT_PLAYER_LIST_ORDER];
    }

    const expected = new Set(DEFAULT_PLAYER_LIST_ORDER);
    const fromStorage = value.filter((item): item is PlayerListKey => typeof item === 'string' && expected.has(item as PlayerListKey));
    const unique = Array.from(new Set(fromStorage));
    if (unique.length !== DEFAULT_PLAYER_LIST_ORDER.length) {
      return [...DEFAULT_PLAYER_LIST_ORDER];
    }

    return unique;
  }

  private buildClaimedCells(state: MapState): Set<string> {
    const claimedArea = new Set<string>();
    const maxX = state.settings.grid.width - 1;
    const maxY = state.settings.grid.height - 1;

    for (const placement of state.placements) {
      const claimSpan = placement.type === 'fortress' ? 15 : placement.type === 'banner' ? 7 : null;
      if (!claimSpan) {
        continue;
      }

      const radius = (claimSpan - 1) / 2;
      const centerX = placement.origin.x + (placement.size.w - 1) / 2;
      const centerY = placement.origin.y + (placement.size.h - 1) / 2;
      const startX = Math.max(0, Math.floor(centerX - radius));
      const endX = Math.min(maxX, Math.ceil(centerX + radius));
      const startY = Math.max(0, Math.floor(centerY - radius));
      const endY = Math.min(maxY, Math.ceil(centerY + radius));

      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          claimedArea.add(`${x}:${y}`);
        }
      }
    }

    const borderCells = new Set<string>();
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;

    for (const cell of claimedArea) {
      const [xStr, yStr] = cell.split(':');
      const x = Number(xStr);
      const y = Number(yStr);

      const isBorder = directions.some(([dx, dy]) => !claimedArea.has(`${x + dx}:${y + dy}`));
      if (isBorder) {
        borderCells.add(cell);
      }
    }

    return borderCells;
  }

  private buildClaimedBorderClassMap(claimed: Set<string>): Map<string, string[]> {
    const classMap = new Map<string, string[]>();

    for (const key of claimed) {
      const [xStr, yStr] = key.split(':');
      const x = Number(xStr);
      const y = Number(yStr);

      const classes = ['grid__cell--claimed'];
      if (!claimed.has(`${x}:${y - 1}`)) {
        classes.push('grid__cell--claimed-top');
      }
      if (!claimed.has(`${x}:${y + 1}`)) {
        classes.push('grid__cell--claimed-bottom');
      }
      if (!claimed.has(`${x - 1}:${y}`)) {
        classes.push('grid__cell--claimed-left');
      }
      if (!claimed.has(`${x + 1}:${y}`)) {
        classes.push('grid__cell--claimed-right');
      }

      classMap.set(key, classes);
    }

    return classMap;
  }
}
