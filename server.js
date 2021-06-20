/*
* 启动方式
* supervisor server.js
* node server.js
* */
let http = require('http')
let net = require('net')
let fs = require('fs')
let n_path = require('path')
//自动打开浏览器
let open = require('opn')
//服务器渲染插件
let Vue = require('vue')
let renderer = require('vue-server-renderer').createRenderer()
//代码格式化
let style_html = require('./app/tools/htmlformat')
//默认端口
let listen = 8488

//日志输出
let log = (color = '', log = '', tips = 'tips:') => {
    if (color === 'red') {

        console.log('\033[41;37m ' + tips + ' \033[40;31m ' + log + '\033[0m')
    }
    if (color === 'blue') {
        console.log('\033[44;37m ' + tips + ' \033[40;34m ' + log + '\033[0m')
    }
    if (color === 'green') {
        console.log('\033[42;30m ' + tips + ' \033[40;32m ' + log + '\033[0m')
    }
}

/*
* 错误消息
* */
let errorMsg = (res, resMsg = '') => {
    res.writeHead(200, {"Content-Type": "text/html;charset='utf-8'"});
    res.end(`<div style="box-sizing: border-box;padding: 30px 50px"><div style="background-color: #f7eeee;box-sizing: border-box;line-height: 1;padding:15px 20px;border-radius: 5px;color: red">${resMsg}</div></div>`)
}

/*
* 判断端口是否可用
* */
let portIsOccupied = (port) => {
    // 创建服务并监听该端口
    let server = net.createServer().listen(port)
    return new Promise((resolve, reject) => {
        server.on('listening', function () { // 执行这块代码说明端口未被占用
            server.close() // 关闭服务
            resolve()
        })
        server.on('error', function (err) {
            if (err.code === 'EADDRINUSE') { // 端口已经被使用
                console.log(port + '已被占用')
            }
            reject()
        })
    })
}

//复制静态文件
let copyFiles = (path = './public/', toPath ) => {
    let filesList = fs.readdirSync(path)
    filesList.map(item => {
        fs.stat(path + item, (err, data) => {
            if (!err) {
                if (data.isDirectory()) {
                    //创建文件夹,并且递归复制
                    if (!fs.existsSync(toPath + item)) {
                        fs.mkdirSync(toPath + item)
                    }
                    copyFiles(path + item + '/', toPath + item + '/')
                } else {
                    //复制文件
                    // 创建读取流
                    let readable = fs.createReadStream(path + item)
                    // 创建写入流
                    let writable = fs.createWriteStream(toPath + item)
                    // 通过管道来传输流
                    readable.pipe(writable)
                }
            }
        })
    })
}

/*
* 生成网页
* */
let createHtml = (filePath, renderResult, toFilePath = './cache') => {
    if (!toFilePath) {
        toFilePath = './cache'
    }
    //生成网页
    if (filePath === '/index') {
        createDir(toFilePath)
        fs.writeFile(toFilePath + '/index.html', renderResult, () => {})
    }
    createDir(toFilePath + filePath)
    fs.writeFile(toFilePath + filePath + '/index.html', renderResult, () => {})
}

/*
* 获取通用组件
* */
let getComponents = (data) => {
    let files = fs.readdirSync('./app/components')
    let fileList = {}
    files.map(item => {
        let tempPath = './app/components/'
        fileList[item] = {
            template: fs.readFileSync(tempPath + item + '/' + item + '.html', 'utf-8'),
            data() {
                return {
                    ...require(tempPath + item + '/' + item + '.js'),
                    ...data
                }
            }
        }
    })
    return fileList
}

/*
* 请求函数
* */
let req = (req, res) => {
    let filePath = req.url
    //处理斜线/结尾的url
    if (filePath !== '/' && filePath.charAt(filePath.length - 1) === '/') {
        filePath = filePath.substr(0, filePath.length - 1)
    }
    let pathInfo = filePath.split('.')
    if (pathInfo.length > 1 && pathInfo[pathInfo.length - 1] !== 'html') {
        fs.readFile('./public' + filePath, function (err, data) {
            if (err) {
                errorMsg(res, '404')
                // res.end('404')
            } else {
                res.end(data)
            }
        })
    } else {
        console.log(filePath)
        //执行服务端渲染
        serverRender(filePath, ((err, html) => {
            if (err) {
                errorMsg(res, err)
            } else {
                res.end(html)
            }
        }))
    }
}

/*
* 线上预览
* */
let prePath = './dist'
let pre = (req, res) => {
    let filePath = req.url
    let path
    let pathInfo = filePath.split('.')
    if (pathInfo.length > 1 && pathInfo[pathInfo.length - 1] !== 'html') {
        path = prePath + filePath
    } else {
        if (filePath === '/index') {
            path = prePath + '/index.html'
        } else {
            path = prePath + filePath + '/index.html'
        }

    }
    fs.readFile(path, function (err, data) {
        if (err) {
            errorMsg(res, '404')
            // res.end('404')
        } else {
            res.end(data)
        }
    })
}

/*
* 获取当前的ip地址
* */
let getCurrentIp = function () {
    let os = require('os')
    let ip = ''
    let faces = os.networkInterfaces()
    out:
        for (let i in faces) {
            for (let j in faces[i]) {
                let val = faces[i][j]
                if (val.family === 'IPv4' && val.address !== '127.0.0.1') {
                    ip = val.address
                    return ip
                    break out
                }
            }
        }
}

/*
* 创建http服务器
* */
let createServer = (cb) => {
    portIsOccupied(listen)
        .then(() => {
            console.log(args[0] + ':http://localhost:' + listen + '')
            console.log(args[0] + ':http://' + getCurrentIp() + ':' + listen + '')
            if (args[0] === 'build') {
                open('http://' + getCurrentIp() + ':' + listen + '')
            }
            http.createServer(cb).listen(listen)
        })
        .catch(() => {
            listen += 1
            createServer(cb)
        })
}

/*
* 删除旧文件夹
* */
let deleteFolder = (path = './cache') => {
    let files = []
    if (fs.existsSync(path)) {
        files = fs.readdirSync(path)
        files.map(function (file) {
            let curPath = path + "/" + file
            if (fs.statSync(curPath).isDirectory()) {
                deleteFolder(curPath)
            } else {
                fs.unlinkSync(curPath)
            }
        })
        fs.rmdirSync(path)
    }
}

/*
* 获取参数
* */
let args = process.argv.splice(2)

/*
* 启动服务
* */
if (!args[0]) {
    args[0] = 'dev'
    createServer(req)
    log('blue', '正在运行')
}

if (args[0] == 'clear_build') {
    let files = fs.readdirSync('./')
    files.map(function (file) {
        let filePath = './' + file
        if (fs.statSync(filePath).isDirectory() && (filePath.search('build') !== -1 || filePath.search('dist') !== -1)) {
            log('red', '已清除文件夹:' + filePath)
            deleteFolder(filePath)
        }
    })

}

/*
* 处理版本
* */
let addV = (key, value) => {
    let _packageJson = fs.readFileSync('./package.json')
    let data = JSON.parse(_packageJson)
    if (!key) {
        return data.version
    }
    let version = data.version.split('.')
    version[key] = parseInt(version[key]) + value
    data.version = version.join('.')
    fs.writeFileSync('./package.json', JSON.stringify(data, null, 4), {encoding: 'utf8'})
    return data.version
}

let createDir = (path) => {
    let createPath = path.split('/').filter(item => item)
    for (let i = createPath.length - 1; i > 0; i--) {
        let filePath = createPath.slice(0, createPath.length - i + 1).join('/')
        if (!fs.existsSync(filePath)) {
            console.log('已创建文件夹:' + filePath)
            fs.mkdirSync(filePath)
        }
    }
}

/*
* 服务端渲染主函数
* */
let serverRender = (filePath, cb) => {
    if (filePath === "/" || filePath === "/index" || filePath === "/index.html") {
        filePath = "/index"
    }
    //处理renderData
    let renderData = {}
    let controllerPath = './app/controller' + filePath
    try {
        renderData = require(controllerPath)
    } catch (error) {
        cb(controllerPath.replace(/\\/g, "/") + '.js:控制器不存在', '')
        return
        // res.end(controllerPath.replace(/\\/g, "/") + '.js:控制器不存在')
    }
    //处理template
    let template = ''
    let templatePath = ''
    if (renderData.template) {
        templatePath = './app/view' + renderData.template
    } else {
        templatePath = './app/view' + filePath + '.html'
    }
    try {
        template = fs.readFileSync(templatePath, 'utf-8')
    } catch (error) {
        cb(templatePath.replace(/\\/g, "/") + ':模板不存在', '')
        return
        // res.end(templatePath.replace(/\\/g, "/") + ':模板不存在')
    }
    //全局数据
    let allData = {
        cpath: filePath,
        allPath: filePath.split('/').filter(item => item !== '')
    }
    // 1实例vue
    let app = new Vue({
        data() {
            return {...renderData, ...allData}
        },
        components: getComponents(allData),
        template: template
    })
    // 2实例renderer
    // 3渲染html
    renderer.renderToString(app, (err, html) => {
        if (err) {
            console.log(err)
            cb('renderToString出现错误', '')
        } else {
            //格式化html
            //https://www.npmjs.com/package/js-beautify
            // let beautify = require('js-beautify').html
            /*let result = beautify(html, {
                // "indent_char": " ",
                /!*"indent_with_tabs": true,
                "eol": "\n",
                "end_with_newline": true,
                "max_preserve_newlines":0,
                "wrap_line_length": 0,*!/

                "indent_size": 4,
                "eol": "\n",
                "max_preserve_newlines": 10,
                "wrap_line_length": 0,
                "templating": ["auto"]

            })*/
            html=html.replace(/\s+data-server-rendered="true"/ig,'')
            let result = style_html(html,1,"\t")
            cb(false, result)
        }
    })
}

/*
* 递归生成文件
* */
let build = (path = './app/controller', fPath = '', toFilePath) => {
    let files = fs.readdirSync(path)
    files.map(function (file) {
        let curPath = path + "/" + file
        let renderPath = fPath + '/' + n_path.parse(file).name
        if (fs.statSync(curPath).isDirectory()) {
            build(curPath, renderPath, toFilePath)
        } else {
            //渲染文件
            serverRender(renderPath, ((err, html) => {
                if (err) {
                    console.log(renderPath + ':出错了')
                } else {
                    //生成html
                    createHtml(renderPath, html, toFilePath)
                    console.log(renderPath + ':已生成')
                }
            }))
        }
    })
}

let createVersionFile = (prePath, version) => {
    fs.writeFileSync(prePath + '/.v', `<div style="box-sizing: border-box;padding: 30px 50px"><div style="background-color: #e9f7ff;box-sizing: border-box;line-height: 1;padding:15px 20px;border-radius: 5px;">${version}</div></div>`, {encoding: 'utf8'})
}

/*
* 打包处理
* */
if (args[0] == 'build') {
    log('red', 'building...')
    let toFilePath = './dist'
    copyFiles('./public/',toFilePath+'/')
    build(path = './app/controller', fPath = '', toFilePath)
    log('green', '已完成')
    console.log(prePath)
    createVersionFile(toFilePath, addV())
    createServer(pre)
    log('green', '已开启预览,已为您打开默认浏览器')
}

if (args[0] == 'build_dev') {
    log('red', 'building...')
    let version = addV(args[1], parseInt(args[2]))
    let toFilePath = './build_v' + version
    copyFiles('./public/',toFilePath+'/')
    build(path = './app/controller', fPath = '', toFilePath)
    prePath = toFilePath
    console.log(prePath)
    log('green', '已完成')
    createVersionFile(toFilePath, version)
    createServer(pre)
}
