import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ReviewsFolderService, Review } from '../../services/reviews-folder.service';
import { ArtistGalleryService } from '../../services/artist-gallery.service';

/**
 * Review Form Component (Source Folder Based)
 * Create/Edit reviews with source linking and component ratings
 */
@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './review-form-folder.component.html',
  styleUrls: ['./review-form-folder.component.scss']
})
export class ReviewFormComponent implements OnInit, OnChanges {
  @Input() sourceFolder: string | null = null;
  @Input() editingReview: Review | null = null;
  @Input() source: 'artist_gallery' | 'prompt_grouping' = 'artist_gallery';
  @Input() foreignId: string | null = null;
  
  @Output() reviewSaved = new EventEmitter<Review>();
  @Output() cancelled = new EventEmitter<void>();

  form: FormGroup;
  isLoading: boolean = false;
  error: string | null = null;
  isEditing: boolean = false;
  thumbnailUrl: string | null = null;

  ratingOptions = [
    { value: 1, label: '1 - Very Poor' },
    { value: 2, label: '2 - Poor' },
    { value: 3, label: '3 - Average' },
    { value: 4, label: '4 - Good' },
    { value: 5, label: '5 - Excellent' }
  ];

  constructor(
    private fb: FormBuilder,
    private reviewsFolderService: ReviewsFolderService,
    private http: HttpClient,
    private galleryService: ArtistGalleryService
  ) {
    this.form = this.fb.group({
      anatomy: ['', Validators.required],
      face: ['', Validators.required],
      object: ['', Validators.required],
      background: ['', Validators.required],
      character: ['', Validators.required],
      notes: ['']
    });
  }

  ngOnInit(): void {
    console.log('[ReviewForm] ngOnInit called, editingReview:', this.editingReview);
    if (this.editingReview) {
      this.populateForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('[ReviewForm] ngOnChanges fired:', Object.keys(changes));
    
    if (changes['editingReview']) {
      console.log('[ReviewForm] editingReview changed:', {
        previousValue: changes['editingReview'].previousValue,
        currentValue: changes['editingReview'].currentValue
      });
      
      if (changes['editingReview'].currentValue) {
        this.populateForm();
      }
    }
  }

  /**
   * Populate form with existing review data
   */
  populateForm(): void {
    console.log('[ReviewForm] populateForm called, editingReview:', this.editingReview);
    
    if (this.editingReview) {
      this.isEditing = true;
      console.log('[ReviewForm] Populating form with review data:', {
        anatomy: this.editingReview.rating?.anatomy,
        face: this.editingReview.rating?.face,
        object: this.editingReview.rating?.object,
        background: this.editingReview.rating?.background,
        character: this.editingReview.rating?.character,
        notes: this.editingReview.notes
      });
      
      this.form.patchValue({
        anatomy: this.editingReview.rating?.anatomy || '',
        face: this.editingReview.rating?.face || '',
        object: this.editingReview.rating?.object || '',
        background: this.editingReview.rating?.background || '',
        character: this.editingReview.rating?.character || '',
        notes: this.editingReview.notes || ''
      });
      
      // Load thumbnail for the review source
      this.loadThumbnailForReview();
    }
  }

  /**
   * Load thumbnail based on review source
   */
  private loadThumbnailForReview(): void {
    if (!this.editingReview) return;
    
    if (this.editingReview.source === 'artist_gallery') {
      this.loadArtistGalleryThumbnail();
    } else if (this.editingReview.source === 'prompt_grouping') {
      this.loadPromptGroupingThumbnail();
    }
  }

  /**
   * Load thumbnail from artist gallery folder
   */
  private loadArtistGalleryThumbnail(): void {
    if (!this.editingReview) return;
    
    this.http.post('http://localhost:3000/api/artist-gallery/group-images', {
      folderPath: this.editingReview.foreign_id
    }).subscribe({
      next: (response: any) => {
        if (response.images && response.images.length > 0) {
          const firstImage = response.images[0];
          this.thumbnailUrl = this.galleryService.getThumbnailUrl(this.editingReview!.foreign_id, firstImage);
          console.log('[ReviewForm] Loaded artist gallery thumbnail:', this.thumbnailUrl);
        }
      },
      error: (err) => {
        console.warn('[ReviewForm] Error loading artist gallery images:', err);
      }
    });
  }

  /**
   * Load thumbnail from prompt grouping folder
   */
  private loadPromptGroupingThumbnail(): void {
    if (!this.editingReview || !this.sourceFolder) return;
    
    this.http.post('http://localhost:3000/api/prompt-grouping/load-groups', {
      folderPath: this.sourceFolder
    }).subscribe({
      next: (response: any) => {
        if (response.groups && response.groups[this.editingReview!.foreign_id]) {
          const groupData = response.groups[this.editingReview!.foreign_id];
          if (groupData.images && groupData.images.length > 0) {
            const firstImage = groupData.images[0];
            // Images are relative paths, prepend sourceFolder
            const fullImagePath = `${this.sourceFolder}/${firstImage}`;
            this.thumbnailUrl = `http://localhost:3000/api/prompt-grouping/image?filePath=${encodeURIComponent(fullImagePath)}&thumbnail=true&v=${Date.now()}`;
            console.log('[ReviewForm] Loaded prompt grouping thumbnail:', this.thumbnailUrl);
          }
        }
      },
      error: (err) => {
        console.warn('[ReviewForm] Error loading prompt grouping groups:', err);
      }
    });
  }

  /**
   * Submit form - create or update review
   */
  submit(): void {
    if (this.form.invalid) {
      this.error = 'Please fill in all required rating fields';
      return;
    }

    if (!this.sourceFolder) {
      this.error = 'No source folder selected';
      return;
    }

    if (this.isEditing && this.editingReview) {
      this.submitEdit();
    } else {
      this.submitCreate();
    }
  }

  /**
   * Create new review
   */
  submitCreate(): void {
    if (!this.foreignId) {
      this.error = 'Missing foreign_id for new review';
      return;
    }

    this.isLoading = true;
    this.error = null;

    const rating = {
      anatomy: parseInt(this.form.value.anatomy, 10),
      face: parseInt(this.form.value.face, 10),
      object: parseInt(this.form.value.object, 10),
      background: parseInt(this.form.value.background, 10),
      character: parseInt(this.form.value.character, 10)
    };

    this.reviewsFolderService.createReview(
      this.sourceFolder!,
      this.source,
      this.foreignId,
      rating,
      this.form.value.notes || ''
    ).subscribe({
      next: (response) => {
        console.log('[ReviewForm] Review created:', response.review.id);
        this.isLoading = false;
        this.resetForm();
        this.reviewSaved.emit(response.review);
      },
      error: (err) => {
        console.error('[ReviewForm] Error creating review:', err);
        this.error = 'Failed to create review: ' + (err.error?.error || err.message);
        this.isLoading = false;
      }
    });
  }

  /**
   * Update existing review
   */
  submitEdit(): void {
    if (!this.editingReview) {
      this.error = 'No review to update';
      return;
    }

    this.isLoading = true;
    this.error = null;

    const rating = {
      anatomy: parseInt(this.form.value.anatomy, 10),
      face: parseInt(this.form.value.face, 10),
      object: parseInt(this.form.value.object, 10),
      background: parseInt(this.form.value.background, 10),
      character: parseInt(this.form.value.character, 10)
    };

    this.reviewsFolderService.updateReview(
      this.sourceFolder!,
      this.editingReview.id,
      rating,
      this.form.value.notes || ''
    ).subscribe({
      next: (response) => {
        console.log('[ReviewForm] Review updated:', response.review.id);
        this.isLoading = false;
        this.resetForm();
        this.reviewSaved.emit(response.review);
      },
      error: (err) => {
        console.error('[ReviewForm] Error updating review:', err);
        this.error = 'Failed to update review: ' + (err.error?.error || err.message);
        this.isLoading = false;
      }
    });
  }

  /**
   * Reset form to initial state
   */
  resetForm(): void {
    this.form.reset();
    this.isEditing = false;
    this.editingReview = null;
    this.error = null;
    this.thumbnailUrl = null;
  }

  /**
   * Cancel editing
   */
  onCancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }
}
