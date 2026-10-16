export interface SourcePosition {
  line: number;
  column: number;
}

export interface DevIdentityRecord {
  id: string;                 // Deterministic: e.g. "dvi_8f3a1b"
  componentName: string;      // e.g. "HeroButton"
  tagName: string;            // e.g. "button"
  file: string;               // Project-relative path: "src/components/Hero.tsx"
  start: SourcePosition;
  end: SourcePosition;
  parentId?: string;          // Nearest ancestor JSX data-dev-id (for Component Tree nesting)
  classNameRange?: {          // Exact AST range of className="..." for surgical Tailwind edits
    rawValue: string;
    syntax?: 'quoted' | 'template';
    start: SourcePosition;
    end: SourcePosition;
  };
  textRange?: {               // Exact AST range of the single static JSXText child (button/heading innerText)
    rawValue: string;
    start: SourcePosition;
    end: SourcePosition;
  };
  stringProps?: Array<{       // All other static string-literal props (title="...", alt="...", etc.)
    name: string;
    rawValue: string;
    start: SourcePosition;
    end: SourcePosition;
  }>;
}

export interface StagedPatchRequest {
  file: string;               // Project-relative path
  originalHash: string;       // SHA-256 of file when read
  start: SourcePosition;
  end: SourcePosition;
  replacement: string;
}

export interface BackendTraceEvent {
  traceId: string;
  triggeredByDevId?: string;
  method: string;
  url: string;
  statusCode: number;
  errorMessage: string;
  backendFile?: string;       // Project-relative backend file path
  backendLine?: number;
  backendColumn?: number;
  timestamp: string;
}
