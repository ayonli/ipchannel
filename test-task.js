const uipc = require(".");

(async () => {
    var chennel = await uipc.connect();
    console.log(chennel.pid);
})();