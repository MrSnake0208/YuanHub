<template>
  <div class="feedback-media-field">
    <div class="feedback-media-heading">
      <span>附件</span>
      <small>{{ media.items.length }} / {{ MAX_FEEDBACK_MEDIA_COUNT }}</small>
    </div>
    <div class="feedback-media-picker-actions">
      <label class="feedback-media-picker-button">
        <ImagePlus :size="15" aria-hidden="true" />
        添加截图
        <input type="file" :accept="FEEDBACK_IMAGE_ACCEPT" multiple :disabled="disabled" @change="media.selectFiles" />
      </label>
      <label class="feedback-media-picker-button">
        <Paperclip :size="15" aria-hidden="true" />
        上传文件
        <input type="file" :accept="FEEDBACK_FILE_ACCEPT" multiple :disabled="disabled" @change="media.selectFiles" />
      </label>
    </div>
    <div v-if="media.items.length" class="feedback-attachment-list">
      <div
        v-for="(item, index) in media.items"
        :key="item.previewUrl || item.file.name + ':' + index"
        class="feedback-attachment-item"
        :class="{ 'is-image': item.kind === 'IMAGE' }"
      >
        <img v-if="item.kind === 'IMAGE'" :src="item.previewUrl" :alt="'待上传截图 ' + (index + 1)" />
        <template v-else>
          <component :is="fileIcon(item.file)" :size="20" aria-hidden="true" />
          <span class="feedback-attachment-copy">
            <strong :title="item.file.name">{{ item.file.name }}</strong>
            <small>{{ fileType(item.file) }} · {{ formatSize(item.file.size) }}</small>
          </span>
        </template>
        <button
          type="button"
          :disabled="disabled"
          :aria-label="`移除附件 ${item.file.name}`"
          title="移除附件"
          @click="media.remove(index)"
        ><X :size="14" aria-hidden="true" /></button>
      </div>
    </div>
    <div v-if="media.error" class="feedback-media-error" role="alert">{{ media.error }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { File, FileArchive, FileJson, FileText, ImagePlus, Paperclip, X } from '@lucide/vue'
import {
  FEEDBACK_FILE_ACCEPT,
  FEEDBACK_IMAGE_ACCEPT,
  MAX_FEEDBACK_MEDIA_COUNT
} from '@/utils/feedbackMedia.js'

const props = defineProps({
  media: { type: Object, required: true },
  busy: { type: Boolean, default: false }
})

const disabled = computed(() => props.busy || props.media.uploading)

function extension(file) {
  return String(file?.name || '').split('.').pop().toLowerCase()
}

function fileIcon(file) {
  return { zip: FileArchive, json: FileJson, txt: FileText, log: FileText }[extension(file)] || File
}

function fileType(file) {
  return extension(file).toUpperCase() || 'FILE'
}

function formatSize(size) {
  const bytes = Number(size || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}
</script>
