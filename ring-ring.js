(function(global) {
  "use strict"

  var svg = "http://www.w3.org/2000/svg";
  var xlink = "http://www.w3.org/1999/xlink";

  // svg element builder sugar
  function $(name, attributes)  {
    var node = document.createElementNS(svg, name);
    return setAttributes(node, attributes);
  }

  function setAttributes(node, attributes) {
    if(!attributes) return node;
    var keys = Object.keys(attributes);
    for(var i = 0, key; i < keys.length; i++) {
      key = keys[i];
      node.setAttribute(key, attributes[key]);
    }
    return node;
  }

  function createDefs() {
    var node = $('defs');
    var arrow = $('marker', {
      id: "markerArrow",
      viewBox: "0 0 30 30",
      refX: 15, refY: 15,
      markerUnits: 'strokeWidth', markerWidth: 3, markerHeight: 3,
      orient: 'auto'
    });
    arrow.appendChild($('path', {d: "m5,0 L20,15 L5,30", style: "stroke-linecap: square;"}));
    node.appendChild(arrow);
    return node;
  }

  /**
   * @params opts.width {integer} element size
   * @params opts.height {integer} element size
   */
  function Scene(opts) {
    this.svg = setAttributes($("svg", {'xmlns:xlink': xlink}), opts);
    this._defs = createDefs();
    this.svg.appendChild(this._defs);
  }

  Scene.prototype.add = function(element) {
    this.svg.appendChild(element.el);
    return this;
  };

  Scene.prototype.defs = function(element) {
    this._defs.appendChild(element.el);
    return this;
  };

  // poor man uid
  var lastId = 0;

  /**
   * @params opts {object}
   * @params opts.x {integer} ring center
   * @params opts.y {integer} ring center
   * @params opts.r {integer} ring radius
   */
  function Ring(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.r = opts.r;
  }

  Ring.prototype.getPos = function(position) {
    var pos;
    if(position.hasOwnProperty('θ')) {
      pos = θ2coords(this, position.θ);
      pos.θ = position.θ;
    } else {
      if(position.hasOwnProperty('x'), position.hasOwnProperty('y')) {
        pos = coords2θ(this, position);
        pos.x = position.x;
        pos.y = position.y;
      } else {
        throw new Error('invalid θ or coords');
      }
    }
    return pos;
  };

  function θ2coords(ring, θ) {
    return {
      x: ring.x + Math.cos(θ) * ring.r,
      y: ring.y + Math.sin(θ) * ring.r
    };
  }
  function coords2θ(ring, coords) {
    return {θ: Math.atan2((coords.y - ring.y) / ring.r, (coords.x - ring.x) / ring.r)};
  }
  function pathy(coords) {
    return [coords.x, coords.y].join(',');
  }

  /**
   * @params ring {Ring} compute on that ring
   * @params from {integer} start at radian
   * @params to   {integer} ending at radian
   * @params [invert] {boolean} half circle part choosing (default to false)
   * @params [attributes] {object} apply attributes to arc element
   */
  function Arc(ring, start, end, invert, attributes) {
    this.id = 'arc'+lastId++;
    this.ring = ring;
    this.set(start, end);
    this.invert = +!!invert;
    this.el = $('path', {id: this.id});
    this.draw();
    setAttributes(this.el, attributes);
  };

  Arc.prototype.draw = function() {
    setAttributes(this.el,{
      d: `M${pathy(this.start)} A${this.ring.r},${this.ring.r},0 0 ${this.invert} ${pathy(this.end)}`
    });
    return this;
  };

  Arc.prototype.set = function(start, end) {
    this.start = this.ring.getPos(start);
    this.end = this.ring.getPos(end);
    return this;
  };

  Arc.prototype.text = function(msg) {
    var t = new Text(msg);
    return t.follow(this);
  };

  function Arrow(ring, start, end, invert, attributes) {
    attributes = attributes || {};
    attributes['marker-end'] = 'url(#markerArrow)';
    Arc.call(this, ring, start, end, invert, attributes);
  }
  Arrow.prototype.set = Arc.prototype.set;
  Arrow.prototype.draw = Arc.prototype.draw;


  function Text(msg, attributes) {
    this.el  = $('text', {
      'text-anchor': 'middle'
    });
    this.path = $('textPath', {startOffset: '50%'});
    setAttributes(this.el, attributes);
    this._msg = document.createTextNode(msg);
    this.path.appendChild(this._msg);
    this.el.appendChild(this.path);
  }

  Text.prototype.follow = function(arc) {
    this.arc = arc;
    this.path.setAttributeNS(xlink, 'href', '#' + this.arc.id);
    return this;
  };

  Text.prototype.msg = function(msg) {
    this._msg.textContent = msg;
  };

  /**
   * Should be invoked only after element is inserted in dom (see #inserted)
   * @params spacer {integer} add some space before and after text
   */
  Text.prototype.getPosition = function(spacer) {
    var arcLen = this.arc.el.getTotalLength();
    var txtLen = this.el.getComputedTextLength() + (spacer || 0);
    var start = this.arc.el.getPointAtLength((arcLen - txtLen) / 2);
    var end = this.arc.el.getPointAtLength((arcLen + txtLen) / 2);
    return {
      start: this.arc.ring.getPos(start),
      end: this.arc.ring.getPos(end)
    };
  };

  /**
   * As text length calculation may not be performed until element are effectively inserted
   * in DOM, using this avoid any bug if there is any defered rendering (aka framework flow).
   * @note using Mutation observers for this. no bench on perf as been done.
   */
  function inserted(node, cb) {
    var doc = node.ownerDocument;
    function isAttached(node, to) {
      return node === to || (node.parentNode && ((node.parentNode === to) || isAttached(node.parentNode, to)));
    }
    if(isAttached(node, doc)) return window.setTimeout(cb);
    function isNode(insertedNode) {
      if((!isAttached(node, insertedNode))) return false;
      observer.disconnect();
      window.setTimeout(cb);
      return true;
    };
    var addedHasNode = function(mutation) {
      [].some.call(mutation.addedNodes, isNode);
    };
    var observer = new MutationObserver(function(mutations) {
      mutations.some(addedHasNode);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    })
  };

  global.mixme = {
    Scene: Scene,
    Ring: Ring,
    Arc: Arc,
    Text: Text,
    Arrow: Arrow,
    inserted: inserted
  };


})(this);
