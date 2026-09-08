import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'

const ChangelogImage = Image.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      media_id: { default: null, rendered: false }
    }
  }
})

const ChangelogLink = Link.extend({
  addAttributes() {
    const attributes = { ...this.parent?.() }
    delete attributes.title
    return attributes
  }
})

export function changelogExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false
    }),
    ChangelogLink.configure({ openOnClick: false, autolink: false, protocols: ['http', 'https'] }),
    ChangelogImage.configure({
      allowBase64: false,
      HTMLAttributes: { loading: 'lazy', decoding: 'async' }
    })
  ]
}

export function emptyChangelogBody() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function isChangelogBodyEmpty(body) {
  if (!body || body.type !== 'doc' || !Array.isArray(body.content)) return true
  function hasContent(node) {
    return !!(node && (
      node.type === 'image' ||
      (node.type === 'text' && typeof node.text === 'string' && node.text.trim()) ||
      (Array.isArray(node.content) && node.content.some(hasContent))
    ))
  }
  return !body.content.some(hasContent)
}
