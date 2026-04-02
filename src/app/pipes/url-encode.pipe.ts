import { Pipe, PipeTransform } from '@angular/core';

/**
 * URL Encode Pipe
 * Encodes a string using encodeURIComponent for use in URLs
 */
@Pipe({
  name: 'urlEncode',
  standalone: true
})
export class UrlEncodePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      return '';
    }
    return encodeURIComponent(value);
  }
}
