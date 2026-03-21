import MDEditor, { type MDEditorProps } from '@uiw/react-md-editor/nohighlight';
import '@uiw/react-md-editor/markdown-editor.css';

export default function LazyMDEditor(props: MDEditorProps) {
  return <MDEditor {...props} />;
}
