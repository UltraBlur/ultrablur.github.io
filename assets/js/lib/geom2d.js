/* 2D 多边形几何：凸多边形裁剪（Sutherland–Hodgman）与面积。浏览器与 node 共用。 */
(function (root) {
  'use strict';

  /* subject 为任意多边形，clipper 必须凸；返回交集多边形（无交集时长度 ≤ 2） */
  function clipPolygon(subject, clipper) {
    var out = subject.slice();
    for (var i = 0; i < clipper.length && out.length; i++) {
      var a = clipper[i], b = clipper[(i + 1) % clipper.length];
      var input = out;
      out = [];
      for (var j = 0; j < input.length; j++) {
        var p = input[j], q = input[(j + 1) % input.length];
        var side = function (pt) { return (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); };
        var sp = side(p), sq = side(q);
        if (sp >= 0) out.push(p);
        if ((sp >= 0) !== (sq >= 0)) {
          var t = sp / (sp - sq);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
    }
    return out;
  }

  function polygonArea(pts) {
    var s2 = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s2 += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s2) / 2;
  }

  function triangleArea(tri) {
    var a = tri[0], b = tri[1], c = tri[2];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }

  var api = { clipPolygon: clipPolygon, polygonArea: polygonArea, triangleArea: triangleArea };
  root.Geom2D = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
