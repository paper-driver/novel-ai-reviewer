import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-panel.component.html',
  styleUrls: ['./filter-panel.component.scss']
})
export class FilterPanelComponent {
  ratingOptions: string[] = ['', 'F','E','D','C','B-','B','B+','A-','A','A+','S'];
  filters: any = {
    prompt: '',
    handFeet: '',
    facialExpression: '',
    genital: '',
    accessories: '',
    sideCharacter: '',
    background: ''
  };

  @Output() filtersChanged = new EventEmitter<any>();

  /**
   * Emits filters to parent component for table filtering
   */
  applyFilters() {
    this.filtersChanged.emit({ ...this.filters });
  }
}