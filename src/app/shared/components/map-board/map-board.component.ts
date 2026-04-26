import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';

import { MapState, Player, TilePlacement, toExternal } from '../../../core/domain';

@Component({
  selector: 'app-map-board',
  imports: [CommonModule],
  templateUrl: './map-board.component.html',
  styleUrl: './map-board.component.scss',
})
export class MapBoardComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input({ required: true }) state!: MapState;
  @Input() highlightPlayerId: string | null = null;

  @ViewChild('panzoomHost')
  private panzoomHost?: ElementRef<HTMLElement>;

  @ViewChild('gridElement')
  private gridElement?: ElementRef<HTMLElement>;

  @ViewChild('boardViewport')
  private boardViewport?: ElementRef<HTMLElement>;

  hoveredCell: { x: number; y: number } | null = null;

  private panzoom?: PanzoomObject;
  private centerTimeoutId?: number;
  private readonly wheelHandler = (event: WheelEvent) => {
    this.panzoom?.zoomWithWheel(event);
  };

  ngAfterViewInit(): void {
    if (!this.panzoomHost) {
      return;
    }

    this.panzoom = Panzoom(this.panzoomHost.nativeElement, {
      minScale: 0.1,
      maxScale: 2.5,
      step: 0.2,
    });

    this.panzoomHost.nativeElement.parentElement?.addEventListener('wheel', this.wheelHandler);
    this.fitZoom();

    if (this.highlightPlayerId) {
      this.centerOnPlayer(this.highlightPlayerId);
    }
  }

  ngOnDestroy(): void {
    if (this.centerTimeoutId) {
      window.clearTimeout(this.centerTimeoutId);
    }

    this.panzoomHost?.nativeElement.parentElement?.removeEventListener('wheel', this.wheelHandler);
    this.panzoom?.destroy();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['highlightPlayerId'] && this.highlightPlayerId) {
      this.centerOnPlayer(this.highlightPlayerId);
    }
  }

  get gridStyle(): Record<string, string> {
    return {
      '--grid-width': `${this.state.settings.grid.width}`,
      '--grid-height': `${this.state.settings.grid.height}`,
    };
  }

  get gridCells(): Array<{ x: number; y: number }> {
    const cells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.state.settings.grid.height; y += 1) {
      for (let x = 0; x < this.state.settings.grid.width; x += 1) {
        cells.push({ x, y });
      }
    }

    return cells;
  }

  setHoveredCell(x: number, y: number): void {
    this.hoveredCell = { x, y };
  }

  clearHoveredCell(): void {
    this.hoveredCell = null;
  }

  zoomIn(): void {
    this.panzoom?.zoomIn();
  }

  zoomOut(): void {
    this.panzoom?.zoomOut();
  }

  resetZoom(): void {
    this.panzoom?.reset();
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

  getPlacementStyle(placement: TilePlacement): Record<string, string> {
    return {
      '--origin-x': `${placement.origin.x + 1}`,
      '--origin-y': `${placement.origin.y + 1}`,
      '--tile-w': `${placement.size.w}`,
      '--tile-h': `${placement.size.h}`,
    };
  }

  getTileLabel(placement: TilePlacement): string {
    if (placement.type === 'city') {
      return `${this.getPlayerNameById(placement.playerId)} ${this.getPlayerPowerById(placement.playerId)}`;
    }

    switch (placement.type) {
      case 'banner':
        return 'Banner';
      case 'allianceResource':
        return 'Alliance Resource';
      case 'bearTrap1':
        return 'Bear Trap 1';
      case 'bearTrap2':
        return 'Bear Trap 2';
      case 'fortress':
        return 'Fortress';
      default:
        return placement.type;
    }
  }

  getExternalCoordsLabel(x: number, y: number): string {
    const external = toExternal({ x, y }, this.state.settings.externalReference);
    return `${external.x}/${external.y}`;
  }

  isPlacementHighlighted(placement: TilePlacement): boolean {
    return placement.type === 'city' && !!this.highlightPlayerId && placement.playerId === this.highlightPlayerId;
  }

  private centerOnPlayer(playerId: string): void {
    if (this.centerTimeoutId) {
      window.clearTimeout(this.centerTimeoutId);
    }

    this.panToPlayer(playerId);
    requestAnimationFrame(() => this.panToPlayer(playerId));
    this.centerTimeoutId = window.setTimeout(() => this.panToPlayer(playerId), 220);
  }

  private panToPlayer(playerId: string): void {
    const viewport = this.boardViewport?.nativeElement;
    const panzoom = this.panzoom;
    if (!viewport || !panzoom) {
      return;
    }

    const placement = this.state.placements.find((item) => item.type === 'city' && item.playerId === playerId);
    if (!placement) {
      return;
    }

    const cellSize = 24;
    const cellGap = 1;
    const tileWidth = placement.size.w * cellSize + (placement.size.w - 1) * cellGap;
    const tileHeight = placement.size.h * cellSize + (placement.size.h - 1) * cellGap;
    const targetX = placement.origin.x * (cellSize + cellGap) + tileWidth / 2;
    const targetY = placement.origin.y * (cellSize + cellGap) + tileHeight / 2;
    const scale = panzoom.getScale();

    panzoom.pan(viewport.clientWidth / 2 - targetX * scale, viewport.clientHeight / 2 - targetY * scale, {
      animate: true,
    });
  }

  private getPlayerNameById(playerId?: string): string {
    const player = this.getPlayerById(playerId);
    return player?.name ?? playerId ?? '';
  }

  private getPlayerPowerById(playerId?: string): number {
    return this.getPlayerById(playerId)?.power ?? 0;
  }

  private getPlayerById(playerId?: string): Player | undefined {
    if (!playerId) {
      return undefined;
    }

    const allPlayers = [
      ...this.state.players.trap1Main,
      ...this.state.players.trap2Main,
      ...this.state.players.trap1General,
      ...this.state.players.trap2General,
    ];

    return allPlayers.find((item) => item.id === playerId);
  }
}
