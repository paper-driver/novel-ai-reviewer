import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ClipboardModule, ClipboardService } from 'ngx-clipboard';
import { BehaviorSubject } from 'rxjs';
import { FolderPickerService } from '../../services/folder-picker.service';

interface ArtistInCombo {
  name: string;
  emphasis: number;
  strength: string;
}

interface CombinationSuggestion {
  id?: string;
  artists: Array<{
    artist: any;
    role: string;
    emphasis: number;
  }>;
  explanation: string;
  confidence: string;
  rankScore: number;
}

interface SavedCombination {
  id: string;
  name: string;
  artists: ArtistInCombo[];
  promptFormat: string;
  createdAt: string;
}

@Component({
  selector: 'app-combination-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ClipboardModule],
  templateUrl: './combination-generator.component.html',
  styleUrls: ['./combination-generator.component.scss']
})
export class CombinationGeneratorComponent implements OnInit {
  suggestions$ = new BehaviorSubject<CombinationSuggestion[]>([]);
  savedCombinations$ = new BehaviorSubject<SavedCombination[]>([]);
  selectedFolder$ = new BehaviorSubject<string>('');
  isLoading$ = new BehaviorSubject<boolean>(false);
  error$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  copiedSuggestionIndex$ = new BehaviorSubject<number | null>(null);
  copiedSavedId$ = new BehaviorSubject<string | null>(null);

  generatorForm: FormGroup;
  showSaved = false;
  selectedCombination: CombinationSuggestion | null = null;
  showSaveDialog = false;
  saveCombinationName = '';
  private messageTimeout: any;

  keywords = {
    styles: ['anime', 'realistic', 'cartoon', 'fine art', 'semi-realistic', 'manga', 'acg', 'wuxia'],
    attributes: ['anatomy', 'colors', 'detailed', 'dynamic', 'expression', 'lighting', 'objects'],
    intensity: ['subtle', 'moderate', 'strong', 'very strong']
  };

  folderInput: string = '';

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private folderPickerService: FolderPickerService,
    private clipboard: ClipboardService
  ) {
    this.generatorForm = this.fb.group({
      userInput: ['', [Validators.required, Validators.minLength(10)]],
      maxSuggestions: [5, Validators.required]
    });
  }

  ngOnInit() {
    this.loadSavedCombinations();
    const savedFolder = localStorage.getItem('artistRegistryFolder');
    if (savedFolder) {
      this.folderInput = savedFolder;
      this.selectedFolder$.next(savedFolder);
    }
  }

  /**
   * Open native folder picker using FolderPickerService
   */
  async selectFolderWithPicker() {
    try {
      const selectedPath = await this.folderPickerService.pickFolder();
      if (selectedPath) {
        this.folderInput = selectedPath;
        localStorage.setItem('artistRegistryFolder', selectedPath);
        this.selectedFolder$.next(selectedPath);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      this.error$.next('Failed to open folder picker');
    }
  }

  /**
   * Generate artist combinations from user input
   */
  generateCombinations() {
    if (!this.generatorForm.valid) {
      return;
    }

    this.isLoading$.next(true);
    this.error$.next('');

    const { userInput, maxSuggestions } = this.generatorForm.value;
    const folderPath = this.selectedFolder$.value;

    this.http.post<any>('http://localhost:3001/api/combination-generator/generate', {
      folderPath,
      userInput,
      maxSuggestions
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.suggestions$.next(response.suggestions || []);
        } else {
          this.error$.next(response.message || 'Failed to generate combinations');
        }
        this.isLoading$.next(false);
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to generate combinations');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Save a combination for later use
   */
  saveCombination(combo: CombinationSuggestion) {
    this.selectedCombination = combo;
    this.showSaveDialog = true;
  }

  /**
   * Confirm save combination
   */
  confirmSave() {
    if (!this.saveCombinationName.trim() || !this.selectedCombination) {
      return;
    }

    this.isLoading$.next(true);

    this.http.post<any>('http://localhost:3001/api/combination-generator/save-combination', {
      combination: this.selectedCombination,
      name: this.saveCombinationName
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.loadSavedCombinations();
          this.showSaveDialog = false;
          this.saveCombinationName = '';
        }
        this.isLoading$.next(false);
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to save combination');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Load saved combinations
   */
  loadSavedCombinations() {
    this.http.get<any>('http://localhost:3001/api/combination-generator/saved')
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.savedCombinations$.next(response.combinations || []);
          }
        },
        error: (error) => {
          console.error('Error loading saved combinations:', error);
        }
      });
  }

  /**
   * Format combination as prompt
   */
  getPromptFormat(combo: CombinationSuggestion): string {
    if (!combo.artists || combo.artists.length === 0) {
      return '';
    }

    return combo.artists
      .map(a => `${a.emphasis}::artist:${a.artist.name}::`)
      .join(', ');
  }

  /**
   * Copy prompt to clipboard with feedback
   */
  copyToClipboard(combo: CombinationSuggestion, index: number) {
    const prompt = this.getPromptFormat(combo);
    if (prompt) {
      this.clipboard.copy(prompt);
      this.copiedSuggestionIndex$.next(index);
      
      // Clear feedback after 2 seconds
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
      }
      this.messageTimeout = setTimeout(() => {
        this.copiedSuggestionIndex$.next(null);
      }, 2000);
    }
  }

  /**
   * Copy saved combination prompt to clipboard with feedback
   */
  copySavedCombination(combo: SavedCombination) {
    if (combo.promptFormat) {
      this.clipboard.copy(combo.promptFormat);
      this.copiedSavedId$.next(combo.id);
      
      // Clear feedback after 2 seconds
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
      }
      this.messageTimeout = setTimeout(() => {
        this.copiedSavedId$.next(null);
      }, 2000);
    }
  }

  /**
   * Show success message and auto-hide after 3 seconds
   */
  private showSuccessMessage(message: string) {
    this.successMessage$.next(message);
    
    // Clear any existing timeout
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    
    // Set new timeout to clear message
    this.messageTimeout = setTimeout(() => {
      this.successMessage$.next('');
    }, 3000);
  }

  /**
   * Add quick keyword to input
   */
  addKeyword(keyword: string) {
    const current = this.generatorForm.get('userInput')?.value || '';
    this.generatorForm.patchValue({
      userInput: current ? `${current} ${keyword}` : keyword
    });
  }

  /**
   * Get color for confidence badge
   */
  getConfidenceLevel(confidence: string): string {
    const percent = parseInt(confidence);
    if (percent >= 90) return 'high';
    if (percent >= 75) return 'medium';
    if (percent >= 60) return 'low';
    return 'minimal';
  }

  /**
   * Toggle suggestion expansion
   */
  toggleSuggestion(combo: CombinationSuggestion) {
    if (this.selectedCombination === combo) {
      this.selectedCombination = null;
    } else {
      this.selectedCombination = combo;
    }
  }

  /**
   * Toggle saved combinations panel
   */
  toggleSavedPanel() {
    this.showSaved = !this.showSaved;
  }

  /**
   * Get color for confidence badge
   */
  getConfidenceColor(confidence: string): string {
    const percent = parseInt(confidence);
    if (percent >= 90) return 'success';
    if (percent >= 75) return 'info';
    if (percent >= 60) return 'warning';
    return 'secondary';
  }

  /**
   * Open saved combination
   */
  useSavedCombination(saved: SavedCombination) {
    const combo = {
      artists: saved.artists.map(a => ({
        artist: { name: a.name },
        role: 'mixed',
        emphasis: a.emphasis
      })),
      explanation: `Saved combination: ${saved.name}`,
      confidence: '100%',
      rankScore: 1
    };

    this.suggestions$.next([combo as any]);
  }

  /**
   * Delete saved combination
   */
  deleteSavedCombination(id: string) {
    if (!confirm('Delete this saved combination?')) {
      return;
    }

    const combos = this.savedCombinations$.value.filter(c => c.id !== id);
    this.savedCombinations$.next(combos);

    // In a real app, would call backend to persist deletion
  }
}
