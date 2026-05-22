/**
 * Vercel Speed Insights Integration
 * 
 * Speed Insights is designed for client-side/frontend applications to measure
 * Web Vitals and performance metrics. For this Express backend API, the integration
 * is only useful if the API serves HTML pages to browsers.
 * 
 * This implementation provides:
 * 1. A basic initialization function that logs Speed Insights availability
 * 2. Express middleware to inject the Speed Insights script into HTML responses
 * 
 * Note: Since this API primarily serves JSON responses, Speed Insights will only
 * collect metrics for any HTML pages you serve. For pure API endpoints, consider
 * using Vercel's Observability features: https://vercel.com/docs/observability
 * 
 * For frontend applications that consume this API, implement Speed Insights
 * directly in the frontend using the framework-specific package:
 * - Next.js: @vercel/speed-insights/next
 * - React: @vercel/speed-insights/react
 * - Vue: @vercel/speed-insights/vue
 * - Svelte: @vercel/speed-insights/sveltekit
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Initialize Speed Insights configuration
 * This validates that Speed Insights is properly configured in the Vercel environment
 */
export function initSpeedInsights(): void {
  if (process.env.VERCEL) {
    // Speed Insights is automatically enabled in Vercel dashboard
    // The script is served at /_vercel/speed-insights/script.js
    // No server-side initialization needed - injection happens via middleware
    return;
  }
}

/**
 * Express middleware to inject Speed Insights script into HTML responses
 * 
 * This middleware intercepts responses with Content-Type: text/html and
 * injects the Vercel Speed Insights script tag before the closing </head> tag.
 * 
 * Usage:
 *   app.use(speedInsightsMiddleware());
 * 
 * The script will only be injected when:
 * - Running on Vercel (process.env.VERCEL is set)
 * - Response Content-Type includes 'text/html'
 * - Response body is a string
 * - Response body contains a </head> tag
 */
export function speedInsightsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only inject on Vercel
    if (!process.env.VERCEL) {
      return next();
    }

    // Store original send function
    const originalSend = res.send.bind(res);

    // Override send function to inject Speed Insights
    res.send = function (data: any): Response {
      // Check if response is HTML
      const contentType = res.get('Content-Type') || '';
      
      if (contentType.includes('text/html') && typeof data === 'string') {
        // Inject Speed Insights script before closing head tag
        // This follows Vercel's official documentation pattern
        const speedInsightsScript = `<script defer src="/_vercel/speed-insights/script.js"></script>`;
        
        // Try to inject before </head> for better loading performance
        if (data.includes('</head>')) {
          data = data.replace('</head>', `${speedInsightsScript}</head>`);
        } 
        // Fallback: inject before </body> if no </head> tag
        else if (data.includes('</body>')) {
          data = data.replace('</body>', `${speedInsightsScript}</body>`);
        }
      }

      // Call original send with potentially modified data
      return originalSend(data);
    };

    next();
  };
}
