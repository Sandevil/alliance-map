import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { toExternal } from '../../../core/domain';
import { MapViewFacade } from '../../../core/facades/map-view.facade';
import { MapBoardComponent } from '../../../shared/components/map-board/map-board.component';
import { MapLegendComponent } from '../../../shared/components/map-legend/map-legend.component';

@Component({
  selector: 'app-public-map-page',
  imports: [CommonModule, FormsModule, RouterLink, MapBoardComponent, MapLegendComponent],
  templateUrl: './public-map-page.component.html',
  styleUrl: './public-map-page.component.scss',
})
export class PublicMapPageComponent {
  protected readonly facade = inject(MapViewFacade);

  readonly state = computed(() => this.facade.state());
  readonly query = computed(() => this.facade.query());
  readonly cityResults = computed(() => this.facade.cityResults());
  readonly selectedPlayerId = computed(() => this.facade.selectedPlayerId());
  readonly isPresentationMode = signal(false);

  onQueryChange(value: string): void {
    this.facade.updateQuery(value);
  }

  clearSearch(): void {
    this.facade.updateQuery('');
  }

  togglePresentationMode(): void {
    this.isPresentationMode.update((value) => !value);
  }

  selectCity(playerId: string): void {
    this.facade.selectPlayer(playerId);
  }

  getExternalCoordsLabel(x: number, y: number): string {
    const external = toExternal({ x, y }, this.state().settings.externalReference);
    return `${external.x}/${external.y}`;
  }
}
