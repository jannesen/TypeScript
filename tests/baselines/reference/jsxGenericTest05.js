//// [file.tsx]
/* @jsx-mode generic */

function test() {
    return <div class="test">
                <span/>
           </div>;
}

//// [file.js]
/* @jsx-mode generic */
function test() {
    return ???("div", { "class": "test" },
        ???("span", null));
}
