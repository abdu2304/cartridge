<template>
  <div class="view" data-scroll ref="el">
    <!-- the Steam card's page (0.9.65): recomps grouped by the console each game came from -->
    <header class="lib-head">
      <div>
        <div class="eyebrow">Steam</div>
        <h1 class="big">Recomps</h1>
      </div>
    </header>
    <Recomps />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useView } from '../useView.js';
import Recomps from '../components/Recomps.vue';
const el = ref(null);
useView({}, [{ b: 'A', label: 'Open' }, { b: 'B', label: 'Back' }]);
</script>
