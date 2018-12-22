// @target: es2016
// @module: commonjs
// @noImplicitAny: true
// @jsx: react
// @filename: dom.ts

export interface HTMLAttributes {
    accept?:                string;
    acceptCharset?:         string;
    accessKey?:             string;
    action?:                string;
    allowFullScreen?:       boolean;
    allowTransparency?:     boolean;
    alt?:                   string;
    async?:                 boolean;
    autoComplete?:          boolean;
    autoFocus?:             boolean;
    autoPlay?:              boolean;
    cellPadding?:           number | string;
    cellSpacing?:           number | string;
    charSet?:               string;
    checked?:               boolean;
    classID?:               string;
    class?:                 string;
    colSpan?:               number | string;
    cols?:                  number;
    content?:               string;
    contentEditable?:       boolean;
    contextMenu?:           string;
    controls?:              any;
    coords?:                string;
    crossOrigin?:           string;
    data?:                  string;
    dateTime?:              string;
    defaultChecked?:        boolean;
    defaultValue?:          string;
    defer?:                 boolean;
    dir?:                   string;
    disabled?:              boolean;
    download?:              any;
    draggable?:             boolean;
    encType?:               string;
    for?:                   string;
    form?:                  string;
    formAction?:            string;
    formEncType?:           string;
    formMethod?:            string;
    formNoValidate?:        boolean;
    formTarget?:            string;
    frameBorder?:           number | string;
    headers?:               string;
    height?:                number | string;
    hidden?:                boolean;
    high?:                  number;
    href?:                  string;
    hrefLang?:              string;
    htmlFor?:               string;
    httpEquiv?:             string;
    icon?:                  string;
    id?:                    string;
    label?:                 string;
    lang?:                  string;
    list?:                  string;
    loop?:                  boolean;
    low?:                   number;
    manifest?:              string;
    marginHeight?:          number;
    marginWidth?:           number;
    max?:                   number | string;
    maxLength?:             number;
    media?:                 string;
    mediaGroup?:            string;
    method?:                string;
    min?:                   number | string;
    multiple?:              boolean;
    muted?:                 boolean;
    name?:                  string;
    noValidate?:            boolean;
    open?:                  boolean;
    optimum?:               number;
    pattern?:               string;
    placeholder?:           string;
    poster?:                string;
    preload?:               string;
    radioGroup?:            string;
    readOnly?:              boolean;
    rel?:                   string;
    required?:              boolean;
    role?:                  string;
    rowSpan?:               number;
    rows?:                  number;
    sandbox?:               string;
    scope?:                 string;
    scoped?:                boolean;
    scrolling?:             string;
    seamless?:              boolean;
    selected?:              boolean;
    shape?:                 string;
    size?:                  number;
    sizes?:                 string;
    span?:                  number | string;
    spellCheck?:            boolean;
    src?:                   string;
    srcDoc?:                string;
    srcSet?:                string;
    start?:                 number;
    step?:                  number|string;
    style?:                 string;
    tabIndex?:              number|string;
    target?:                string;
    title?:                 string;
    type?:                  string;
    useMap?:                string;
    value?:                 string;
    width?:                 number|string;
    wmode?:                 string;

    onblur?:                EventHandler<FocusEvent>;
    onclick?:               EventHandler<MouseEvent>;
    onchange?:              EventHandler<Event>;
    oncontextmenu?:         EventHandler<PointerEvent>;
    ondblclick?:            EventHandler<MouseEvent>;
    onerror?:               EventHandler<Event>;
    onfocus?:               EventHandler<FocusEvent>;
    oninput?:               EventHandler<Event>;
    onkeydown?:             EventHandler<KeyboardEvent>;
    onkeypress?:            EventHandler<KeyboardEvent>;
    onkeyup?:               EventHandler<KeyboardEvent>;
    onload?:                EventHandler<Event>;
    onmousedown?:           EventHandler<MouseEvent>;
    onmouseenter?:          EventHandler<MouseEvent>;
    onmouseleave?:          EventHandler<MouseEvent>;
    onmousemove?:           EventHandler<MouseEvent>;
    onmouseout?:            EventHandler<MouseEvent>;
    onmouseover?:           EventHandler<MouseEvent>;
    onmouseup?:             EventHandler<MouseEvent>;
    onwheel?:               EventHandler<WheelEvent>;
    onscroll?:              EventHandler<UIEvent>;
    onselect?:              EventHandler<UIEvent>;
}

export interface EventHandler<T> {
    (event: T): void;
}

type intrinsicNames = "a" | "abbr" | "address" | "area" | "article" | "aside" | "audio" | "b" | "base" | "bdi" | "bdo" | "big" | "blockquote" | "body" | "br" | "button" | "canvas" | "caption" | "cite" | "code" | "col" | "colgroup" | "data" | "datalist" | "dd" | "del" | "details" | "dfn" | "dialog" | "div" | "dl" | "dt" | "em" | "embed" | "fieldset" | "figcaption" | "figure" | "footer" | "form" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "head" | "header" | "hr" | "html" | "i" | "iframe" | "img" | "input" | "ins" | "kbd" | "keygen" | "label" | "legend" | "li" | "link" | "main" | "map" | "mark" | "menu" | "menuitem" | "meta" | "meter" | "nav" | "noscript" | "object" | "ol" | "optgroup" | "option" | "output" | "p" | "param" | "picture" | "pre" | "progress" | "q" | "rp" | "rt" | "ruby" | "s" | "samp" | "script" | "section" | "select" | "small" | "source" | "span" | "strong" | "style" | "sub" | "summary" | "sup" | "table" | "tbody" | "td" | "textarea" | "tfoot" | "th" | "thead" | "time" | "title" | "tr" | "track" | "u" | "ul" | "var" | "video" | "wbr";

export interface AddArray extends Array<AddNode> {}
export type AddNode    = HTMLElement|string|AddArray|undefined|null|false;

export function createElement(tagName:intrinsicNames, attrs?: HTMLAttributes, ...children:AddNode[]): HTMLElement {
    return document.createElement(tagName);
}

// @filename: file.tsx
/* @jsx-mode generic */
/* @jsx-intrinsic-factory $JD.createElement */

import * as $JD from "./dom";

function test() {
    return <div class="test2" onkeydown={(ev) => { ev.preventDefault(); }}>
                <span/>
           </div>;
}