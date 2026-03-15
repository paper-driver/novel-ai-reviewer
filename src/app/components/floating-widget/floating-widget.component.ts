import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiCorrectionsWidgetComponent } from '../ai-corrections-widget/ai-corrections-widget.component';

@Component({
  selector: 'app-floating-widget',
  standalone: true,
  imports: [CommonModule, AiCorrectionsWidgetComponent],
  templateUrl: './floating-widget.component.html',
  styleUrls: ['./floating-widget.component.scss']
})
export class FloatingWidgetComponent {
  isOpen: boolean = false;

  toggleWidget(): void {
    this.isOpen = !this.isOpen;
  }

  closeWidget(): void {
    this.isOpen = false;
  }
}
