// frontend/packages/core/dist/layout/flex-types.js
var nextNodeId = 1;
function createFlexNode(style = {}, measure) {
  return {
    id: nextNodeId++,
    style,
    children: [],
    frame: { x: 0, y: 0, width: 0, height: 0 },
    measure
  };
}
function appendFlexChild(parent, child) {
  parent.children.push(child);
}

export {
  createFlexNode,
  appendFlexChild
};
