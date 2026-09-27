import * as React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./ui/button";

export type EditorSidebarLayer = { id: string; name: string; icon: Node; active?: boolean };

export type EditorSidebarOptions = {
  appIconUrl: string;
  boardName: string;
  boardIcon: Node;
  menuIcon: Node;
  layerIcon: Node;
  collapseIcon: Node;
  collapsed: boolean;
  hidden?: boolean;
  onToggleCollapse: () => void;
  onRename: () => void;
  onBoardMenu: (anchor: HTMLElement) => void;
  layers: EditorSidebarLayer[];
  onSelectLayer: (id: string) => void;
};

function iconMarkup(node: Node) {
  return node instanceof Element ? node.outerHTML : "";
}

function Icon({ node }: { node: Node }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(node) }} />;
}

function EditorSidebarView({ options }: { options: EditorSidebarOptions }) {
  const titleGroupRef = React.useRef<HTMLDivElement>(null);
  const collapse = (
    <Button type="button" variant="ghost" size="icon" className="editor-sidebar-collapse" title={options.collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={options.onToggleCollapse}>
      <Icon node={options.collapseIcon} />
    </Button>
  );

  return (
    <>
      <nav className="editor-sidebar-rail">
        <img src={options.appIconUrl} alt="Canvas" />
        {options.collapsed ? collapse : <Button type="button" variant="ghost" size="icon" className="active" title="Canvas"><Icon node={options.boardIcon} /></Button>}
        {options.collapsed ? <Button type="button" variant="ghost" size="icon" className="active" title="Canvas"><Icon node={options.boardIcon} /></Button> : null}
      </nav>
      {!options.collapsed ? (
        <div className="editor-sidebar-panel">
          <div className="editor-sidebar-title-row">
            <div className="editor-sidebar-title-group" ref={titleGroupRef}>
              <Button type="button" variant="ghost" className="editor-sidebar-title-name" onDoubleClick={options.onRename}>
                <strong>{options.boardName}</strong>
              </Button>
              <Button type="button" variant="ghost" size="icon" className="editor-sidebar-title-chevron" aria-label="Canvas menu" onClick={() => titleGroupRef.current && options.onBoardMenu(titleGroupRef.current)}>
                <Icon node={options.menuIcon} />
              </Button>
            </div>
            {collapse}
          </div>
          <div className="editor-sidebar-section">
            <strong>Canvas</strong>
            <Button type="button" variant="ghost" className="active">
              <span>{<Icon node={options.boardIcon} />}</span>{options.boardName}
            </Button>
          </div>
          <div className="editor-sidebar-section editor-layers-section">
            <strong>Layers</strong>
            {options.layers.map((layer) => (
              <Button type="button" variant="ghost" key={layer.id} className={layer.active ? "active" : ""} onClick={() => options.onSelectLayer(layer.id)}>
                <Icon node={layer.icon} />{layer.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Canvas-style editor sidebar shared by apps that use boards and layers. */
export function createEditorSidebar(options: EditorSidebarOptions): HTMLElement {
  const sidebar = document.createElement("aside");
  sidebar.className = `editor-sidebar${options.collapsed ? " collapsed" : ""}`;
  sidebar.hidden = Boolean(options.hidden);
  createRoot(sidebar).render(<EditorSidebarView options={options} />);
  return sidebar;
}

export { EditorSidebarView as EditorSidebar };
