import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReviewFormComponent } from './components/review-form/review-form.component';
import { FilterPanelComponent } from './components/filter-panel/filter-panel.component';
import { ReviewsTableComponent } from './components/reviews-table/reviews-table.component';
import { ArtistGroupingComponent } from './components/artist-grouping/artist-grouping.component';
import { Review } from './services/review.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReviewFormComponent,
    FilterPanelComponent,
    ReviewsTableComponent,
    ArtistGroupingComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  filters: any = {};
  editingReview: Review | null = null;
  showArtistGrouping = false;

  /**
   * Handler invoked when filters change or when a review is created.
   * @param f Filter object from child components
   */
  onFiltersChange(f: any) {
    this.filters = { ...f };
  }

  /**
   * Handler invoked when user clicks edit on a review
   */
  onEditReview(review: Review) {
    this.editingReview = review;
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Handler invoked after review is created or updated
   */
  onReviewChange() {
    this.editingReview = null;
    this.filters = { ...this.filters };
  }
}