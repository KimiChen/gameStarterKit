/** Fixed stage order. Authors select a semantic tier; providers own numeric ordering. */
export type SemanticZIndex = 'screen' | 'hud' | 'window' | 'feedback';
export type ViewZIndex = Extract<SemanticZIndex, 'screen' | 'window'>;
export type LayerZIndex = Extract<SemanticZIndex, 'hud' | 'feedback'>;
export declare const semanticZIndexOrder: Readonly<Record<SemanticZIndex, number>>;
