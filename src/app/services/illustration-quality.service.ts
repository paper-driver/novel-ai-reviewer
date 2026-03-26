import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface IllustrationQualityScore {
  overallScore: number;           // 0-10 final score
  rawAIScore?: number;            // Original AI score before feedback corrections
  
  // Specific quality metrics
  anatomyScore: number;           // Hands, feet, proportions
  poseScore: number;              // Body positioning, balance
  faceQuality: number;            // Facial features, expressions
  backgroundQuality: number;      // Background coherence and detail
  objectQuality: number;          // Clothing, accessories rendering
  coherenceScore: number;         // Overall logical coherence
  
  // Detailed analysis
  detectedIssues: string[];       // Specific problems found
  detectedStrengths: string[];    // What works well
  confidence: number;             // 0-100
  analysis: string;               // Human-readable summary
  
  // Recommendations
  recommendations: string[];      // Suggestions for improvement
  
  // Feedback correction tracking
  feedbackApplied?: boolean;      // Whether feedback corrections were applied
  feedbackDetails?: any;          // Details about feedback corrections applied
  
  // Processing info
  processingTime: number;         // milliseconds
  cost?: string;                  // Cost of analysis
}

@Injectable({
  providedIn: 'root'
})
export class IllustrationQualityService {
  constructor(private http: HttpClient) {}

  /**
   * Analyze AI-generated illustration quality using Google Cloud Vision API
   * Specifically designed for anime/manga/digital art
   */
  analyzeIllustration(filePath: string): Observable<IllustrationQualityScore> {
    console.log('[IllustrationQuality] Analyzing illustration:', filePath);
    return this.http.post<IllustrationQualityScore>(
      'http://localhost:3001/api/analyze-illustration',
      { filePath }
    );
  }

  /**
   * Batch analyze multiple illustrations
   */
  batchAnalyzeIllustrations(filePaths: string[]): Observable<IllustrationQualityScore[]> {
    console.log('[IllustrationQuality] Batch analyzing', filePaths.length, 'illustrations');
    return this.http.post<IllustrationQualityScore[]>(
      'http://localhost:3001/api/batch-analyze-illustrations',
      { filePaths }
    );
  }

  /**
   * Get explanation for a specific quality metric
   */
  explainScore(metric: string, score: number): string {
    const explanations: { [key: string]: { [key: number]: string } } = {
      anatomyScore: {
        0: '❌ Severe anatomy errors - hands/feet are broken',
        2: '⚠️ Multiple anatomy issues - hands/feet distorted',
        4: '⚠️ Minor anatomy problems - acceptable but noticeable',
        6: '✓ Basic anatomy correct - minor imperfections',
        8: '✓ Good anatomy - minor issues only',
        10: '✅ Excellent anatomy - anatomically correct'
      },
      poseScore: {
        0: '❌ Unnatural/impossible pose',
        2: '⚠️ Awkward posing - balance issues',
        4: '⚠️ Pose is okay but stiff',
        6: '✓ Natural pose - decent balance',
        8: '✓ Good pose - nice flow',
        10: '✅ Excellent pose - dynamic and balanced'
      },
      faceQuality: {
        0: '❌ Face is distorted/malformed',
        2: '⚠️ Facial features unclear or wrong',
        4: '⚠️ Face is acceptable but odd',
        6: '✓ Face looks decent',
        8: '✓ Good face quality',
        10: '✅ Beautiful face - excellent expression'
      },
      backgroundQuality: {
        0: '❌ Background is nonsensical/broken',
        2: '⚠️ Background incoherent - conflicting elements',
        4: '⚠️ Background okay but poorly detailed',
        6: '✓ Basic background - fits the scene',
        8: '✓ Good background - nice detail',
        10: '✅ Excellent background - immersive and detailed'
      },
      objectQuality: {
        0: '❌ Objects/clothes are broken',
        2: '⚠️ Clothing/accessories distorted',
        4: '⚠️ Objects okay but simplified',
        6: '✓ Objects rendered decently',
        8: '✓ Good object quality',
        10: '✅ Excellent object rendering - realistic textures'
      },
      coherenceScore: {
        0: '❌ Image makes no sense - incoherent',
        2: '⚠️ Strange elements - poor composition',
        4: '⚠️ Mostly coherent but odd',
        6: '✓ Coherent - elements fit together',
        8: '✓ Good coherence - makes sense',
        10: '✅ Perfect coherence - everything belongs'
      }
    };

    const metricExp = explanations[metric];
    if (!metricExp) return 'Unknown metric';

    // Find closest explanation by rounding score
    const roundedScore = Math.round(score / 2) * 2;
    return metricExp[roundedScore] || metricExp[Math.min(10, roundedScore + 2)] || 'Score: ' + score.toFixed(1);
  }
}
