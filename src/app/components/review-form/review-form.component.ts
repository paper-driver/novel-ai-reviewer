import { Component, EventEmitter, Output, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ReviewService, Review } from '../../services/review.service';

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './review-form.component.html',
  styleUrls: ['./review-form.component.scss']
})
export class ReviewFormComponent implements OnInit, OnChanges {
  form: FormGroup;
  imageFiles: File[] = [];
  ratingOptions: string[] = ['F','E','D','C','B-','B','B+','A-','A','A+','S'];
  
  @Input() editingReview: Review | null = null;
  @Output() reviewCreated = new EventEmitter<void>();
  @Output() reviewUpdated = new EventEmitter<void>();

  isEditing: boolean = false;
  existingImages: string[] = [];
  imagesToRemove: Set<string> = new Set();
  existingImageUrls: { [key: string]: string } = {};

  constructor(private fb: FormBuilder, private reviewService: ReviewService) {
    this.form = this.fb.group({
      prompt: ['', Validators.required],
      review: ['', Validators.required],
      handFeet: ['', Validators.required],
      facialExpression: ['', Validators.required],
      genital: ['', Validators.required],
      accessories: ['', Validators.required],
      sideCharacter: ['', Validators.required],
      background: ['', Validators.required]
    });
  }

  ngOnInit() {
    // If editing review is provided, populate form
    if (this.editingReview) {
      this.populateFormWithReview();
    }
  }

  /**
   * Detect changes to the editingReview input
   */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['editingReview'] && changes['editingReview'].currentValue) {
      this.populateFormWithReview();
    }
  }

  /**
   * Populate the form with existing review data for editing
   */
  populateFormWithReview() {
    if (this.editingReview) {
      this.isEditing = true;
      this.existingImages = [...this.editingReview.images];
      this.imagesToRemove.clear();
      
      // Build URLs for existing images
      this.existingImageUrls = {};
      this.existingImages.forEach(img => {
        this.existingImageUrls[img] = `http://localhost:3000/api/images/${this.editingReview?.folder}/${img}`;
      });
      
      this.form.patchValue({
        prompt: this.editingReview.prompt,
        review: this.editingReview.review,
        handFeet: this.editingReview.ratings.handFeet,
        facialExpression: this.editingReview.ratings.facialExpression,
        genital: this.editingReview.ratings.genital,
        accessories: this.editingReview.ratings.accessories,
        sideCharacter: this.editingReview.ratings.sideCharacter,
        background: this.editingReview.ratings.background
      });
    }
  }

  /**
   * Clear editing state and reset form
   */
  clearEditing() {
    this.isEditing = false;
    this.editingReview = null;
    this.form.reset();
    this.imageFiles = [];
    this.existingImages = [];
    this.imagesToRemove.clear();
    this.existingImageUrls = {};
  }

  /**
   * Handles selection of images from file input
   */
  onFileChange(event: any) {
    const files: FileList = event.target.files;
    this.imageFiles = Array.from(files);
  }

  /**
   * Remove an existing image from the review
   */
  removeExistingImage(imageName: string) {
    this.existingImages = this.existingImages.filter(img => img !== imageName);
    this.imagesToRemove.add(imageName);
  }

  /**
   * Restore a previously marked for removal image
   */
  restoreExistingImage(imageName: string) {
    if (!this.existingImages.includes(imageName)) {
      this.existingImages.push(imageName);
    }
    this.imagesToRemove.delete(imageName);
  }

  /**
   * Remove a newly selected image
   */
  removeNewImage(index: number) {
    this.imageFiles = this.imageFiles.filter((_, i) => i !== index);
  }

  /**
   * Submits the form and either creates new review or updates existing one
   */
  submit() {
    if (this.form.invalid) {
      return;
    }

    if (this.isEditing && this.editingReview) {
      this.submitEdit();
    } else {
      this.submitCreate();
    }
  }

  /**
   * Submit new review creation
   */
  submitCreate() {
    if (this.imageFiles.length === 0) {
      alert('Please select at least one image for a new review');
      return;
    }

    const formData = new FormData();
    formData.append('prompt', this.form.value.prompt);
    formData.append('review', this.form.value.review);
    const ratings = {
      handFeet: this.form.value.handFeet,
      facialExpression: this.form.value.facialExpression,
      genital: this.form.value.genital,
      accessories: this.form.value.accessories,
      sideCharacter: this.form.value.sideCharacter,
      background: this.form.value.background
    };
    formData.append('ratings', JSON.stringify(ratings));
    this.imageFiles.forEach(file => formData.append('images', file));
    
    this.reviewService.createReview(formData).subscribe(() => {
      // reset form and images after successful submission
      this.form.reset();
      this.imageFiles = [];
      this.reviewCreated.emit();
    });
  }

  /**
   * Submit review update
   */
  submitEdit() {
    if (!this.editingReview) {
      return;
    }

    const formData = new FormData();
    formData.append('prompt', this.form.value.prompt);
    formData.append('review', this.form.value.review);
    const ratings = {
      handFeet: this.form.value.handFeet,
      facialExpression: this.form.value.facialExpression,
      genital: this.form.value.genital,
      accessories: this.form.value.accessories,
      sideCharacter: this.form.value.sideCharacter,
      background: this.form.value.background
    };
    formData.append('ratings', JSON.stringify(ratings));
    
    // Add existing images that are not being removed
    formData.append('existingImages', JSON.stringify(this.existingImages));
    
    // Add new images if any were selected
    this.imageFiles.forEach(file => formData.append('images', file));

    this.reviewService.updateReview(this.editingReview.id, formData).subscribe(() => {
      this.clearEditing();
      this.reviewUpdated.emit();
    });
  }
}