import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ReviewsFolderService, Review } from '../../services/reviews-folder.service';
import { ArtistGalleryService } from '../../services/artist-gallery.service';
import { ReviewTagsComponent } from '../review-tags/review-tags.component';

/**
 * Review Form Component (Source Folder Based)
 * Create/Edit reviews with source linking and component ratings
 */
@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, ReviewTagsComponent],
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
  imageFilenames: string[] = []; // Images in the current review
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

    // Load thumbnail for new reviews when source or foreignId changes
    if ((changes['source'] || changes['foreignId']) && !this.editingReview && this.source && this.foreignId) {
      console.log('[ReviewForm] Loading thumbnail for new review:', { source: this.source, foreignId: this.foreignId });
      this.loadThumbnailForReview();
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
      
      // Load images for this review (for bulk tagging)
      this.loadImagesForReview();
      
      // Initialize tags
      this.loadReviewTags();
    }
  }

  /**
   * Load thumbnail based on review source
   */
  private loadThumbnailForReview(): void {
    // Determine source and foreignId from either editingReview or input properties
    const source = this.editingReview?.source || this.source;
    const foreignId = this.editingReview?.foreign_id || this.foreignId;
    
    if (!source || !foreignId) {
      console.log('[ReviewForm] Missing source or foreignId for thumbnail loading');
      return;
    }
    
    if (source === 'artist_gallery') {
      this.loadArtistGalleryThumbnail(foreignId);
    } else if (source === 'prompt_grouping') {
      this.loadPromptGroupingThumbnail(foreignId);
    }
  }

  /**
   * Load thumbnail from artist gallery folder
   */
  private loadArtistGalleryThumbnail(galleryFolderId: string): void {
    this.http.post('http://localhost:3001/api/artist-gallery/group-images', {
      folderPath: galleryFolderId
    }).subscribe({
      next: (response: any) => {
        if (response.images && response.images.length > 0) {
          const firstImage = response.images[0];
          this.thumbnailUrl = this.galleryService.getThumbnailUrl(galleryFolderId, firstImage);
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
  private loadPromptGroupingThumbnail(groupId: string): void {
    if (!this.sourceFolder) {
      console.warn('[ReviewForm] sourceFolder not set for prompt grouping thumbnail');
      return;
    }
    
    this.http.post('http://localhost:3001/api/prompt-grouping/load-groups', {
      folderPath: this.sourceFolder
    }).subscribe({
      next: (response: any) => {
        if (response.groups && response.groups[groupId]) {
          const groupData = response.groups[groupId];
          if (groupData.images && groupData.images.length > 0) {
            const firstImage = groupData.images[0];
            // Images are relative paths, prepend sourceFolder
            const fullImagePath = `${this.sourceFolder}/${firstImage}`;
            this.thumbnailUrl = `http://localhost:3001/api/prompt-grouping/image?filePath=${encodeURIComponent(fullImagePath)}&thumbnail=true&v=${Date.now()}`;
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
   * Load images for the current review (for bulk tagging)
   */
  private loadImagesForReview(): void {
    if (!this.editingReview) {
      return;
    }

    const source = this.editingReview.source;
    const foreignId = this.editingReview.foreign_id;

    if (source === 'artist_gallery') {
      this.http.post<any>('http://localhost:3001/api/artist-gallery/group-images', {
        folderPath: foreignId
      }).subscribe({
        next: (response) => {
          if (response.images && Array.isArray(response.images)) {
            this.imageFilenames = response.images;
            console.log('[ReviewForm] Loaded', this.imageFilenames.length, 'images for review');
          }
        },
        error: (err) => {
          console.warn('[ReviewForm] Error loading artist gallery images:', err);
        }
      });
    } else if (source === 'prompt_grouping') {
      if (!this.sourceFolder) {
        return;
      }

      this.http.post<any>('http://localhost:3001/api/prompt-grouping/load-groups', {
        folderPath: this.sourceFolder
      }).subscribe({
        next: (response) => {
          if (response.groups && response.groups[foreignId]) {
            const groupData = response.groups[foreignId];
            if (groupData.images && Array.isArray(groupData.images)) {
              // Convert relative paths to full paths
              this.imageFilenames = groupData.images.map((relativePath: string) =>
                `${this.sourceFolder}/${relativePath}`
              );
              console.log('[ReviewForm] Loaded', this.imageFilenames.length, 'images for review');
            }
          }
        },
        error: (err) => {
          console.warn('[ReviewForm] Error loading prompt grouping groups:', err);
        }
      });
    }
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

  /**
   * Handle tags changed in ReviewTagsComponent
   */
  onTagsChanged(tagIds: string[]): void {
    if (this.editingReview) {
      this.editingReview.tags = tagIds;
      console.log('[ReviewForm] Tags updated:', tagIds);
    }
  }

  /**
   * Load review tags from the service
   */
  private loadReviewTags(): void {
    if (!this.editingReview) {
      return;
    }

    // The tags will be loaded by ReviewTagsComponent via input
    // This method ensures the tags property is initialized
    if (!this.editingReview.tags) {
      this.editingReview.tags = [];
    }
  }
}
