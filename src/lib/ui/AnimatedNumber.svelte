<script lang="ts">
  // Interface U1: a number that rolls to its new value (NumberFlow). NumberFlow draws every digit
  // as a column 0–9 inside a shadow root, so the value is also written as plain text for screen
  // readers and tests, and the animated copy is hidden from them.
  import NumberFlow from '@number-flow/svelte';
  let { value, format }: { value: number; format?: Intl.NumberFormatOptions } = $props();
  const text = $derived(new Intl.NumberFormat('sv-SE', format).format(value));
</script>

<span class="visually-hidden" data-number>{text}</span><span aria-hidden="true"
  ><NumberFlow {value} {format} locales="sv-SE" /></span
>
