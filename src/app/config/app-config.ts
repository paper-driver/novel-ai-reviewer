/**
 * App Configuration Constants
 * Central place for app-wide configuration
 */

export const APP_CONFIG = {
  // API Configuration
  apiBaseUrl: 'http://localhost:5000',
  apiVersion: 'v1',
  
  // API Endpoints
  endpoints: {
    // Folder operations
    pickFolder: '/api/pick-folder',
    openFolder: '/api/open-folder',
    openFile: '/api/open-file',
    
    // Reviews
    reviews: '/api/reviews',
    reviewById: (id: number) => `/api/reviews/${id}`,
    
    // Ratings
    ratings: {
      load: '/api/ratings/load',
      save: '/api/ratings/save'
    },
    
    // Artist Gallery
    artistGallery: {
      loadGroups: '/api/artist-gallery/load-groups',
      groupImages: '/api/artist-gallery/group-images',
      image: '/api/artist-gallery/image',
      imageMetadata: '/api/artist-gallery/image-metadata',
      copyFromSource: '/api/artist-gallery/copy-from-source'
    },
    
    // Prompt Grouping
    promptGrouping: {
      loadGroups: '/api/prompt-grouping/load-groups',
      progress: '/api/prompt-grouping/progress',
      groupImages: '/api/prompt-grouping/group-images',
      image: '/api/prompt-grouping/image',
      imageMetadata: '/api/prompt-grouping/image-metadata',
      setNickname: '/api/prompt-grouping/set-nickname',
      copyFromSource: '/api/prompt-grouping/copy-from-source'
    },
    
    // Batch Rating
    batchRating: {
      submit: '/api/batch-rating/submit',
      status: (jobId: string) => `/api/batch-rating/status/${jobId}`,
      jobs: '/api/batch-rating/jobs',
      cancel: (jobId: string) => `/api/batch-rating/cancel/${jobId}`,
      results: (jobId: string) => `/api/batch-rating/results/${jobId}`
    },
    
    // Illustration Quality
    analyzingIllustration: '/api/analyze-illustration',
    batchAnalyzeIllustrations: '/api/batch-analyze-illustrations',
    
    // Feedback
    feedback: '/api/feedback/stats',
    
    // Images
    images: '/api/images',
    
    // Health
    health: '/api/health'
  },
  
  // Utility function to build full API URL
  buildUrl(endpoint: string, queryString: string = ''): string {
    return `${this.apiBaseUrl}${endpoint}${queryString}`;
  }
};

export default APP_CONFIG;
