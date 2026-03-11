import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { ReviewFormComponent } from './components/review-form/review-form.component';
import { ReviewsTableComponent } from './components/reviews-table/reviews-table.component';
import { FilterPanelComponent } from './components/filter-panel/filter-panel.component';

@NgModule({
  declarations: [],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    AppComponent,
    ReviewFormComponent,
    ReviewsTableComponent,
    FilterPanelComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}