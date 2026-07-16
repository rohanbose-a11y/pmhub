import { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

interface RichTextEditorProps {
  defaultValue?: string
  onChange: (html: string) => void
  placeholder?: string
}

export function RichTextEditor({ defaultValue, onChange, placeholder }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const editorEl = document.createElement('div')
    container.appendChild(editorEl)

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder: placeholder ?? 'Optional notes or context…',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['image'],
          ['clean'],
        ],
      },
    })

    if (defaultValue) {
      quill.clipboard.dangerouslyPasteHTML(defaultValue)
      // Move cursor to end after setting content
      quill.setSelection(quill.getLength(), 0)
    }

    quill.on('text-change', () => {
      const html = quill.root.innerHTML
      onChangeRef.current(html === '<p><br></p>' ? '' : html)
    })

    return () => {
      container.innerHTML = ''
    }
  }, []) // intentionally run once — treats editor as uncontrolled

  return (
    <div
      ref={containerRef}
      className="rte-wrapper rounded-xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400 focus-within:bg-white transition-all"
    />
  )
}
