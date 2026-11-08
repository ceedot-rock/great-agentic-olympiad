"use strict";

// Small LZ77-style codec. Tokens are internal control characters; the public
// contract only requires that decode(encode(text)) === text.
var ESC = 1;
var LIT = 2;
var WINDOW = 4096;
var MAX_LEN = 255;

function encode(text) {
  var s = String(text);
  var out = [];
  var dict = new Map();
  var i = 0;

  function add(pos) {
    if (pos + 4 > s.length) return;
    var key = s.slice(pos, pos + 4);
    var list = dict.get(key);
    if (!list) {
      list = [];
      dict.set(key, list);
    }
    list.push(pos);
    if (list.length > 64) list.shift();
  }

  while (i < s.length) {
    var bestLen = 0;
    var bestOff = 0;
    if (i + 4 <= s.length) {
      var list = dict.get(s.slice(i, i + 4));
      if (list) {
        for (var j = 0; j < list.length; j++) {
          var pos = list[j];
          if (i - pos > WINDOW) continue;
          var len = 4;
          while (len < MAX_LEN && i + len < s.length && s[pos + len] === s[i + len]) len++;
          if (len > bestLen) {
            bestLen = len;
            bestOff = i - pos;
          }
        }
      }
    }
    if (bestLen >= 6) {
      out.push(String.fromCharCode(ESC), String.fromCharCode(bestOff >> 8), String.fromCharCode(bestOff & 255), String.fromCharCode(bestLen));
      for (var k = 0; k < bestLen; k++) add(i + k);
      i += bestLen;
    } else {
      var ch = s[i];
      var code = ch.charCodeAt(0);
      if (code === ESC || code === LIT) out.push(String.fromCharCode(LIT), ch);
      else out.push(ch);
      add(i);
      i++;
    }
  }
  return out.join("");
}

function decode(packet) {
  var p = String(packet);
  var out = [];
  var i = 0;
  while (i < p.length) {
    var code = p.charCodeAt(i);
    if (code === ESC) {
      var off = (p.charCodeAt(i + 1) << 8) | p.charCodeAt(i + 2);
      var len = p.charCodeAt(i + 3);
      var start = out.length - off;
      for (var k = 0; k < len; k++) out.push(out[start + k]);
      i += 4;
    } else if (code === LIT) {
      out.push(p[i + 1]);
      i += 2;
    } else {
      out.push(p[i]);
      i++;
    }
  }
  return out.join("");
}

module.exports = { encode, decode };
