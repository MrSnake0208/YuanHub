import { shallowRef } from 'vue'

// Only a successful product GET can wake the tutorial; a save receipt is insufficient.
export const inventoryCurrentRead = shallowRef(null)
