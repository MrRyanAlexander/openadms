// Pages link to each other root-relative ('/concepts/statuses/'), the way they read in the source.
// Where the site is served under a base path ('/docs/'), this remark plugin puts the base in front
// of every such link, so the same Markdown works at a host's root and under a path.
import { normaliseBase, underBase } from './urls.ts';

interface MarkdownNode {
  type: string;
  url?: string;
  children?: MarkdownNode[];
}

export function remarkBase(options: { base: string }) {
  const base = normaliseBase(options.base);
  const visit = (node: MarkdownNode): void => {
    if (
      (node.type === 'link' || node.type === 'definition') &&
      node.url?.startsWith('/') === true &&
      !node.url.startsWith('//')
    ) {
      node.url = underBase(base, node.url);
    }
    node.children?.forEach(visit);
  };
  return () =>
    (tree: MarkdownNode): void => {
      if (base !== '/') visit(tree);
    };
}
