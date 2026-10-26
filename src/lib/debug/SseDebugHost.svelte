<script lang="ts">
  // SSE debug tool entry point. App.svelte loads this component with a dynamic import only where
  // the tool exists (dev builds, VITE_SSE_DEBUG=1), so production builds contain none of it.
  // Opens with the L key ("logg"; same rules as F and P: no modifier keys, not while typing) or the
  // URL flag ?sse-debug (?sse-debug=raw also starts the raw readers). Recording runs while the panel
  // is open.
  import { onMount, untrack } from 'svelte';
  import SseDebugPanel from './SseDebugPanel.svelte';
  import { KNOWN_STREAMS, setOpen, setRaw, setRecording, sseDebug } from './sseRecorder.svelte';

  const isFormField = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    (t.isContentEditable || !!t.closest('input, select, textarea, [contenteditable]'));

  function keys(e: KeyboardEvent) {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isFormField(e.target)) return;
    if (e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setOpen(!sseDebug.open);
    } else if (e.key === 'Escape' && sseDebug.open && document.activeElement?.closest('.sse-debug'))
      setOpen(false);
  }

  onMount(() => {
    const flag = new URLSearchParams(location.search).get('sse-debug');
    if (flag !== null) {
      if (flag === 'raw') for (const s of KNOWN_STREAMS) setRaw(s, true);
      setOpen(true);
    }
    return () => setRecording(false);
  });

  $effect(() => {
    const open = sseDebug.open;
    untrack(() => setRecording(open));
  });
</script>

<svelte:window onkeydown={keys} />
{#if sseDebug.open}<SseDebugPanel />{/if}
