import { defineComponent, h } from 'vue'
import { RouterLink } from 'vue-router'
import DocumentCode from './DocumentCode.vue'
import { resolveDeveloperLink } from '../../utils/developerMarkdown.js'

// Marked only lexes: all output is Vue text or an explicitly selected element.
// Never pass Markdown HTML, attributes or tag names into innerHTML/h().
export default defineComponent({
  props: {
    tokens: { type: Array, required: true },
    source: { type: String, required: true },
    assetUrl: { type: Function, required: true }
  },
  setup(props) {
    const text = value => String(value || '').replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[entity])
    function render(tokens) {
      return tokens.map(token => {
        const children = () => token.tokens ? render(token.tokens) : text(token.text)
        switch (token.type) {
          case 'space': case 'def': return null
          case 'heading':
            if (token.coverTitle) return h('span', { id: token.id })
            return h(`h${Math.max(2, token.depth)}`, { id: token.id, tabindex: -1 }, [
              h(RouterLink, { to: '#' + encodeURIComponent(token.id), class: 'document-heading-link', 'aria-label': '跳转到 ' + token.text }, { default: children })
            ])
          case 'paragraph': return h('p', children())
          case 'text': case 'escape': return children()
          case 'strong': return h('strong', children())
          case 'em': return h('em', children())
          case 'del': return h('del', children())
          case 'codespan': return h('code', token.text)
          case 'br': return h('br')
          case 'hr': return h('hr')
          case 'blockquote': return h('blockquote', children())
          case 'code': return h(DocumentCode, { text: token.text, language: (token.lang || '').split(/\s/)[0] })
          case 'list': return h(token.ordered ? 'ol' : 'ul', token.ordered ? { start: token.start } : {}, token.items.map(item => h('li', render(item.tokens))))
          case 'checkbox': return h('input', { type: 'checkbox', disabled: true, checked: token.checked, 'aria-label': token.checked ? '已完成' : '未完成' })
          case 'table': return h('div', { class: 'document-table-scroll', tabindex: 0, role: 'region', 'aria-label': '文档表格，可横向滚动' }, [
            h('table', [
              h('thead', [h('tr', token.header.map(cell => h('th', { scope: 'col' }, render(cell.tokens))))]),
              h('tbody', token.rows.map(row => h('tr', row.map(cell => h('td', render(cell.tokens))))))
            ])
          ])
          case 'link': {
            const link = resolveDeveloperLink(token.href, props.source, props.assetUrl)
            if (!link) return h('span', children())
            if (link.internal) return h(RouterLink, { to: link.href }, { default: children })
            return h('a', { href: link.href, ...(link.download ? { download: link.download } : { target: '_blank', rel: 'noopener noreferrer' }) }, children())
          }
          case 'image': return h('span', text(token.text))
          case 'html': return h('span', token.text)
          default: return text(token.raw)
        }
      })
    }
    return () => h('div', { class: 'document-body' }, render(props.tokens))
  }
})
