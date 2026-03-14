import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Feedback Modal - Captures user corrections to AI scores
 * Shows AI's reasoning and allows user to adjust + explain
 */
@Component({
  selector: 'app-ai-feedback-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="feedback-modal-backdrop" (click)="onBackdropClick($event)">
      <div class="feedback-modal">
        <div class="feedback-header">
          <h2>AI Score Feedback</h2>
          <button class="btn-close" (click)="onCancel()" aria-label="Close">&times;</button>
        </div>

        <div class="feedback-content">
          <!-- AI's Analysis -->
          <div class="card ai-analysis">
            <h3>AI's Analysis</h3>
            <div class="component-breakdown">
              <div class="component" *ngFor="let comp of componentScores">
                <span class="label">{{ comp.name }}:</span>
                <div class="meter">
                  <div class="fill" [style.width.%]="comp.value * 10"></div>
                  <span class="value">{{ comp.value }}/10</span>
                </div>
              </div>
            </div>
            <div class="ai-score">
              <strong>AI Score: {{ aiScore }}/10</strong>
            </div>
          </div>

          <!-- User Adjustment -->
          <div class="card user-adjustment">
            <h3>Your Adjustment</h3>
            <div class="slider-container">
              <label>Do you agree with this score?</label>
              <input
                type="range"
                min="1"
                max="10"
                [(ngModel)]="userScore"
                class="score-slider"
              />
              <div class="score-display">
                <span class="your-score">{{ userScore }}/10</span>
                <span class="correction" [ngClass]="correctionClass">
                  {{ correctionText }}
                </span>
              </div>
            </div>
          </div>

          <!-- Reasoning -->
          <div class="card reasoning">
            <h3>Why are you adjusting the score?</h3>
            <textarea
              [(ngModel)]="reasoning"
              placeholder="e.g., The face expression is weak even though anatomy is good..."
              rows="4"
            ></textarea>
            <div class="hint">Optional: Help AI understand your preferences</div>
          </div>
        </div>

        <!-- Actions -->
        <div class="feedback-actions">
          <button 
            (click)="onCancel()" 
            class="btn-cancel"
          >
            Cancel
          </button>
          <button 
            (click)="onSubmit()" 
            class="btn-submit"
            [disabled]="userScore === aiScore && !reasoning"
          >
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .feedback-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }

    .feedback-modal {
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .feedback-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e0e0e0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .feedback-header h2 {
      margin: 0;
      font-size: 18px;
    }

    .btn-close {
      background: none;
      border: none;
      color: white;
      font-size: 28px;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-close:hover {
      opacity: 0.8;
    }

    .feedback-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
    }

    .card {
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .card h3 {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ai-analysis {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border: 1px solid #667eea30;
    }

    .user-adjustment {
      background: linear-gradient(135deg, #4caf5015 0%, #8bc34a15 100%);
      border: 1px solid #4caf5030;
    }

    .reasoning {
      background: linear-gradient(135deg, #2196f315 0%, #03a9f415 100%);
      border: 1px solid #2196f330;
    }

    .component-breakdown {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }

    .component {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .label {
      min-width: 85px;
      font-size: 12px;
      font-weight: 500;
      color: #555;
    }

    .meter {
      flex: 1;
      height: 20px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }

    .fill {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      transition: width 0.3s ease;
    }

    .value {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      font-weight: bold;
      color: #333;
      z-index: 1;
    }

    .ai-score {
      text-align: center;
      padding: 12px;
      background: white;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
      font-size: 15px;
      font-weight: 600;
      color: #667eea;
    }

    .slider-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    label {
      font-weight: 500;
      color: #555;
      font-size: 13px;
    }

    .score-slider {
      width: 100%;
      height: 6px;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      background: #e0e0e0;
      border-radius: 3px;
      outline: none;
    }

    .score-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4caf50, #8bc34a);
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .score-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4caf50, #8bc34a);
      cursor: pointer;
      border: none;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .score-display {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: white;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
    }

    .your-score {
      font-size: 16px;
      font-weight: bold;
      color: #4caf50;
    }

    .correction {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 3px;
      background: #f5f5f5;
      color: #666;
    }

    .correction.lower {
      background: #ffebee;
      color: #c62828;
    }

    .correction.higher {
      background: #e8f5e9;
      color: #2e7d32;
    }

    textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      box-sizing: border-box;
    }

    textarea:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .hint {
      font-size: 11px;
      color: #999;
      margin-top: 6px;
    }

    .feedback-actions {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid #e0e0e0;
      background: #fafafa;
      justify-content: flex-end;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .btn-cancel {
      background: #f5f5f5;
      color: #333;
      border: 1px solid #ddd;
    }

    .btn-cancel:hover {
      background: #e0e0e0;
    }

    .btn-submit {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      min-width: 120px;
    }

    .btn-submit:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }

    .btn-submit:disabled {
      background: #ccc;
      cursor: not-allowed;
      opacity: 0.6;
    }
  `]
})
export class AiFeedbackModalComponent implements OnInit {
  @Input() aiScore: number = 6;
  @Input() components: any = {};
  @Output() feedbackSubmitted = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  userScore: number = 6;
  reasoning: string = '';

  ngOnInit(): void {
    this.userScore = this.aiScore;
  }

  get componentScores() {
    const comp = this.components || {};
    return [
      { name: 'Anatomy', value: comp.anatomyScore || comp.anatomy || 6 },
      { name: 'Pose', value: comp.poseScore || comp.pose || 6 },
      { name: 'Face', value: comp.faceQuality || comp.face || 6 },
      { name: 'Background', value: comp.backgroundQuality || comp.background || 6 },
      { name: 'Objects', value: comp.objectQuality || comp.objects || 6 },
      { name: 'Coherence', value: comp.coherenceScore || comp.coherence || 6 }
    ];
  }

  get correction(): number {
    return this.userScore - this.aiScore;
  }

  get correctionText(): string {
    if (this.correction === 0) return 'Same';
    if (this.correction > 0) return `+${this.correction}`;
    return `${this.correction}`;
  }

  get correctionClass(): string {
    if (this.correction > 0) return 'higher';
    if (this.correction < 0) return 'lower';
    return '';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  onCancel(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    this.feedbackSubmitted.emit({
      userScore: this.userScore,
      reasoning: this.reasoning,
      correction: this.correction
    });
  }
}
