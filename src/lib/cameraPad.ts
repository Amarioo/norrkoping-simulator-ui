/**
 * Interface U4: the keys held on the on-screen camera pad (CameraPad.svelte), named like the keyboard
 * keys FreeCamera.svelte already understands ('w', 'a', 's', 'd', 'q', 'e'). FreeCamera reads the set
 * every frame; nothing here is reactive.
 */
export const padKeys = new Set<string>();
