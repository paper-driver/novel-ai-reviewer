import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

type TabId = 'reviews-management' | 'grouping' | 'gallery' | 'prompt-grouping' | 'artist-registry' | 'combination-generator';

interface NavigationTab {
  id: TabId;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-floating-nav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './floating-nav.component.html',
  styleUrls: ['./floating-nav.component.scss']
})
export class FloatingNavComponent {
  @Input() currentTab: TabId = 'reviews-management';
  @Output() tabChanged = new EventEmitter<TabId>();

  isCollapsed = true; // Start collapsed by default

  tabs: NavigationTab[] = [
    { id: 'reviews-management', label: 'Reviews', icon: '📋' },
    { id: 'grouping', label: 'Artist Groups', icon: '🎨' },
    { id: 'gallery', label: 'Gallery', icon: '🖼️' },
    { id: 'prompt-grouping', label: 'Prompts', icon: '💡' },
    { id: 'artist-registry', label: 'Artist Registry', icon: '📚' },
    { id: 'combination-generator', label: 'Combination Generator', icon: '✨' }
  ];

  selectTab(tabId: TabId): void {
    this.tabChanged.emit(tabId);
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }
}
