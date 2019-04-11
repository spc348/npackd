Error.prototype.toString = function() {
  'use strict';

  var obj = Object(this);
  if (obj !== this) {
    throw new TypeError();
  }

  var name = this.name;
  name = (name === undefined) ? 'Error' : String(name);

  var msg = this.message;
  msg = (msg === undefined) ? '' : String(msg);

  if (name === '') {
    return msg;
  }
  if (msg === '') {
    return name;
  }

  return name + ': ' + msg;
};

Array.prototype.contains = function(v) {
    for (var i = 0; i < this.length; i++) {
        if (this[i] == v)
            return true;
    }
    return false;
}

// http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
function shuffle(array) {
    var counter = array.length, temp, index;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

function uploadAllToGithub(url, releaseID) {
    WScript.Echo("Re-uploading packages in " + url);

    var xDoc = new ActiveXObject("MSXML2.DOMDocument.6.0");
    xDoc.async = false;
    xDoc.setProperty("SelectionLanguage", "XPath");
    WScript.Echo("Loading " + url);
    if (xDoc.load(url)) {
        var packages_ = xDoc.selectNodes("//package[category='reupload']");

	// copy the nodes into a real array
	var packages = [];
        for (var i = 0; i < packages_.length; i++) {
            packages.push(packages_[i].getAttribute("name"));
        }
	
        var pvs_ = xDoc.selectNodes("//version");

        // copy the nodes into a real array
        var pvs = [];
        for (var i = 0; i < pvs_.length; i++) {
            pvs.push(pvs_[i]);
        }

        for (var i = 0; i < pvs.length; i++) {
            var pv = pvs[i];
            var package_ = pv.getAttribute("package");
            var version = pv.getAttribute("name");
	    var n = pv.selectSingleNode("url");
	    var url = "";
	    if (n !== null)
		url = n.text;

	    if (packages.contains(package_) && url.indexOf(
		"https://github.com/tim-lebedkov/packages/releases/download/") !== 0 &&
		url !== "") {
		WScript.Echo("https://www.npackd.org/p/" + package_ + "/" + version);

		try {
		    var newURL = uploadToGithub(url, package_, version, releaseID);
                    if (apiSetURL(package_, version, newURL)) {
			WScript.Echo(package_ + " " + version + " changed URL");
                    } else {
			WScript.Echo("Failed to change URL for " + package_ + " " + version);
                    }
		} catch (e) {
		    WScript.Echo(e.toString());
		}
		WScript.Echo("------------------------------------------------------------------");
	    }
        }
    } else {
        WScript.Echo("Error loading XML");
        return 1;
    }
    WScript.Echo("==================================================================");
}

function uploadToGithub(from, package_, version, releaseID) {
    WScript.Echo("Re-uploading " + from + " to Github");
    var mime = "application/vnd.microsoft.portable-executable"; // "application/octet-stream";

    var p = from.lastIndexOf("/");
    var file = from.substring(p + 1);

    file = package_ + "-" + version + "-" + file;

    var cmd = "\"" + curl + "\" -f -L --connect-timeout 30 --max-time 900 " + from + " --output " + file;
    WScript.Echo(cmd);
    var result = exec2(cmd);
    if (result[0] !== 0)
	throw new Error("Cannot download the file");

    var url = "https://uploads.github.com/repos/tim-lebedkov/packages/releases/" +
	    releaseID + "/assets?name=" + file;
    var downloadURL = "https://github.com/tim-lebedkov/packages/releases/download/2019_Q1/" + file;
    // WScript.Echo("Uploading to " + url);
    WScript.Echo("Download from " + downloadURL);
    
    result = exec2("\"" + curl + "\" -f -H \"Authorization: token " + githubToken + "\"" +
		       " -H \"Content-Type: " + mime + "\"" +
		       " --data-binary @" + file + " \"" + url + "\"");
    if (result[0] !== 0)
	throw new Error("Cannot upload the file to Github");

    return downloadURL;
}

function exec(cmd) {
    var result = exec2("cmd.exe /s /c \"" + cmd + " 2>&1\"");
    return result[0];
}

/**
 * @param package_ full package name
 * @param version version number or null for "newest"
 * @return path to the specified package or "" if not installed
 */
function getPath(package_, version) {
    var cmd = "cmd.exe /c \"" + npackdcl + "\" path -p " + package_;
    if (version !== null)
        cmd += " -v " + version;
    cmd += " 2>&1";
    
    var res = exec2(cmd);
    var lines = res[1];
    if (lines.length > 0)
        return lines[0];
    else
        return "";
}

/**
 * Executes the specified command, prints its output on the default output.
 *
 * @param cmd this command should be executed
 * @return [exit code, [output line 1, output line2, ...]]
 */
function exec2(cmd) {
    var p = shell.exec(cmd);
    var output = [];
    while (!p.StdOut.AtEndOfStream) {
        var line = p.StdOut.ReadLine();
        WScript.Echo(line);
        output.push(line);
    }

    return [p.ExitCode, output];
}

/**
 * Notifies the application at https://npackd.appspot.com about an installation
 * or an uninstallation.
 *
 * @param package_ package name
 * @param version version number
 * @param install true if it was an installation, false if it was an
 *     un-installation
 * @param success true if the operation was successful
 */
function apiNotify(package_, version, install, success) {
    download("https://npackd.appspot.com/api/notify?package=" +
            package_ + "&version=" + version +
            "&password=" + password +
            "&install=" + (install ? "1" : "0") + 
            "&success=" + (success ? "1" : "0"));
}

/**
 * Adds or removes a tag for a package version at https://npackd.appspot.com .
 *
 * @param package_ package name
 * @param version version number
 * @param tag the name of the tag
 * @param set true if the tag should be added, false if the tag should be 
 *     removed
 * @return true if the call to the web service succeeded, false otherwise
 */
function apiTag(package_, version, tag, set) {
    return download("https://npackd.appspot.com/api/tag?package=" +
            package_ + "&version=" + version +
            "&password=" + password +
            "&name=" + tag + 
            "&value=" + (set ? "1" : "0"));
}

/**
 * Changes the URL for a package version at https://npackd.appspot.com .
 *
 * @param package_ package name
 * @param version version number
 * @param url new URL
 * @return true if the call to the web service succeeded, false otherwise
 */
function apiSetURL(package_, version, url) {
    return download("https://npackd.appspot.com/api/set-url?package=" +
            package_ + "&version=" + version +
            "&password=" + password +
	    "&url=" + encodeURIComponent(url));
}

/**
 * Processes one package version.
 *
 * @param package_ package name
 * @param version version number
 * @return true if the test was successful
 */
function process(package_, version) {
    var ec = exec("\"" + npackdcl + "\" add --package="+package_
                + " --version=" + version + " -t 600");
    if (ec !== 0) {
        WScript.Echo("npackdcl.exe add failed");
        apiNotify(package_, version, true, false);
        apiTag(package_, version, "test-failed", true);
		
        var log = package_ + "-" + version + "-install.log";
        exec("cmd.exe /C \"" + npackdcl + "\" add -d --package="+ package_
					+ " --version=" + version + " -t 600 > " + log + " 2>&1");
        exec("appveyor PushArtifact " + log);
		
        return false;
    }
    apiNotify(package_, version, true, true);

    var path = getPath(package_, version);
    WScript.Echo("where=" + path);
    if (path !== "") {
        var tree = package_ + "-" + version + "-tree.txt";
        exec2("cmd.exe /c tree \"" + path + "\" /F > " + tree + " 2>&1");
        exec("appveyor PushArtifact " + tree);

        exec("cmd.exe /c dir \"" + path + "\"");

        var msilist = package_ + "-" + version + "-msilist.txt";
        exec2("cmd.exe /c \"C:\\Program Files (x86)\\CLU\\clu.exe\" list-msi > " + msilist + " 2>&1");
        exec("appveyor PushArtifact " + msilist);

        var info = package_ + "-" + version + "-info.txt";
        exec("cmd.exe /C \"" + npackdcl + "\" info --package="+ package_
					+ " --version=" + version + " > " + info + " 2>&1");
        exec("appveyor PushArtifact " + info);

        var list = package_ + "-" + version + "-list.txt";
        exec("cmd.exe /C \"" + npackdcl + "\" list > " + list + " 2>&1");
        exec("appveyor PushArtifact " + list);

        var proglist = package_ + "-" + version + "-proglist.txt";
        exec2("cmd.exe /c \"C:\\Program Files (x86)\\Sysinternals_suite\\psinfo.exe\" -s /accepteula > " + proglist + " 2>&1");
        exec("appveyor PushArtifact " + proglist);
    }

    var ec = exec("\"" + npackdcl + "\" remove -e=ck --package="+package_
                + " --version=" + version + " -t 600");
    if (ec !== 0) {
        WScript.Echo("npackdcl.exe remove failed");
        apiNotify(package_, version, false, false);
        apiTag(package_, version, "test-failed", true);

        var log = package_ + "-" + version + "-uninstall.log";
        exec("cmd.exe /C \"" + npackdcl + 
                "\" remove -d -e=ck --package=" + package_
                + " --version=" + version + " -t 600 > " + log + " 2>&1");
        exec("appveyor PushArtifact " + log);
		
        return false;
    }
    apiNotify(package_, version, false, true);
    apiTag(package_, version, "test-failed", false);
    return true;
}

function countPackageFiles(Folder) {
    var NF = 2;
    var n = 0;

    for (var objEnum = new Enumerator(Folder.Files); !objEnum.atEnd(); objEnum.moveNext()) {
        n++;
        if (n > NF)
            break;
    }


    if (n <= NF) {
        for (var objEnum = new Enumerator(Folder.SubFolders); !objEnum.atEnd(); objEnum.moveNext()) {
            if (n > NF)
                break;

            var d = objEnum.item();
            if (d.Name.toLowerCase() !== ".npackd") {
                n += countPackageFiles(d);
            }
        }
    }

    return n;
}

/**
 * Downloads a file.
 *
 * @param url URL
 * @return true if the download was OK
 */
function download(url) {
    var Object = WScript.CreateObject('MSXML2.XMLHTTP');

    Object.Open('GET', url, false);
    Object.Send();

    return Object.Status == 200;
}

/**
 * Downloads a JSON file.
 *
 * @param url URL
 * @return [HTTP status, JSON]
 */
function downloadJSON(url) {
    var Object = WScript.CreateObject('MSXML2.XMLHTTP');

    Object.Open('GET', url, false);
    Object.Send();

    if (Object.Status == 200)
	return [Object.Status, eval(Object.responseText)];
    else
	return [Object.Status, null];
}

/**
 * @param a first version as a String
 * @param b first version as a String
 */
function compareVersions(a, b) {
	a = a.split(".");
	b = b.split(".");
	
	var len = Math.max(a.length, b.length);
	
	var r = 0;
	
	for (var i = 0; i < len; i++) {
		var ai = 0;
		var bi = 0;
		
		if (i < a.length)
			ai = parseInt(a[i]);
		if (i < b.length)
			bi = parseInt(b[i]);

		// WScript.Echo("comparing " + ai + " and " + bi);
		
		if (ai < bi) {
			r = -1;
			break;
		} else if (ai > bi) {
			r = 1;
			break;
		}
	}
	
	return r;
}

/**
 * @param onlyNewest true = only test the newest versions
 */
function processURL(url, password, onlyNewest) {
    var start = new Date();
    
    var xDoc = new ActiveXObject("MSXML2.DOMDocument.6.0");
    xDoc.async = false;
    xDoc.setProperty("SelectionLanguage", "XPath");
    WScript.Echo("Loading " + url);
    if (xDoc.load(url)) {
        var pvs_ = xDoc.selectNodes("//version");

        // copy the nodes into a real array
        var pvs = [];
        for (var i = 0; i < pvs_.length; i++) {
            pvs.push(pvs_[i]);
        }

	// only retain newest versions for each package
	if (onlyNewest) {
	    WScript.Echo("Only testing the newest versions out of " + pvs.length);
	    var newest = {};
	    for (var i = 0; i < pvs.length; i++) {
		var pvi = pvs[i];
		var pvip = pvi.getAttribute("package");
		var pvj = newest[pvip];
		
		if (((typeof pvj) === "undefined") ||
		    compareVersions(pvi.getAttribute("name"), 
				    pvj.getAttribute("name")) > 0) {
		    newest[pvip] = pvi;
		}
	    }
	    
	    pvs = [];
	    for (var key in newest) {
		pvs.push(newest[key]);
		
		/*
		  WScript.Echo("Newest: " + newest[key].getAttribute("package") + 
		  " " +
		  newest[key].getAttribute("name"));
		*/
	    }

	    WScript.Echo("Only the newest versions: " + pvs.length);
	}
		
        shuffle(pvs);

        // WScript.Echo(pvs.length + " versions found");
        var failed = [];

        for (var i = 0; i < pvs.length; i++) {
            var pv = pvs[i];
            var package_ = pv.getAttribute("package");
            var version = pv.getAttribute("name");

            WScript.Echo(package_ + " " + version);
            WScript.Echo("https://www.npackd.org/p/" + package_ + "/" + version);
	    if (bigPackages.contains(package_)) {
                WScript.Echo(package_ + " " + version + " ignored because of the download size");
	    } else if (!process(package_, version)) {
                failed.push(package_ + "@" + version);
            } else {
                if (apiTag(package_, version, "untested", false)) {
                    WScript.Echo(package_ + " " + version + " was marked as tested");
                } else {
                    WScript.Echo("Failed to mark " + package_ + " " + version + " as tested");
                }
            }
            WScript.Echo("==================================================================");

	    if ((new Date()).getTime() - start.getTime() > 45 * 60 * 1000) {
		break;
	    }
        }

        if (failed.length > 0) {
            WScript.Echo(failed.length + " packages failed:");
            for (var i = 0; i < failed.length; i++) {
                WScript.Echo(failed[i]);
            }
            return 1;
        } else {
            WScript.Echo("All packages are OK in " + url);
        }
    } else {
        WScript.Echo("Error loading XML");
        return 1;
    }

    return 0;
}

function downloadRepos() {
    // download the newest repository files and commit them to the project
    exec("\"" + git + "\" checkout master");

    exec("\"" + curl + "\" -f -o repository\\RepUnstable.xml " +
	 "https://www.npackd.org/rep/xml?tag=unstable");
    exec("\"" + curl + "\" -f -o repository\\Rep.xml " +
	 "https://www.npackd.org/rep/xml?tag=stable");
    exec("\"" + curl + "\" -f -o repository\\Rep64.xml " +
	 "https://www.npackd.org/rep/xml?tag=stable64");
    exec("\"" + curl + "\" -f -o repository\\Libs.xml " +
	 "https://www.npackd.org/rep/xml?tag=libs");

    exec("\"" + git + "\" config user.email \"tim.lebedkov@gmail.com\"");
    exec("\"" + git + "\" config user.name \"tim-lebedkov\"");
    exec("\"" + git + "\" commit -a -m \"Automatic data transfer from https://www.npackd.org\"");
    exec("\"" + git + "\" push https://tim-lebedkov:" + githubToken +
	 "@github.com/tim-lebedkov/npackd.git");
}

var npackdcl = "C:\\Program Files (x86)\\NpackdCL\\ncl.exe";
var git = "C:\\Program Files\\Git\\cmd\\git.exe";

var curl = getPath("se.haxx.curl.CURL64", null) + "\\bin\\curl.exe";

var FSO = new ActiveXObject("Scripting.FileSystemObject");
var shell = WScript.CreateObject("WScript.Shell");

var arguments = WScript.Arguments;
var password = arguments.Named.Item("password");

var env = shell.Environment("Process");
var githubToken = env("github_token");

// packages with the download size over 1 GiB
var bigPackages = ["mevislab", "mevislab64", "nifi", "com.nokia.QtMinGWInstaller",
		   "urban-terror", "com.microsoft.VisualStudioExpressCD",
		   "com.microsoft.VisualCSharpExpress", "com.microsoft.VisualCPPExpress",
		   "win10-edge-virtualbox", "win7-ie11-virtualbox"];

// WScript.Echo("password=" + githubToken);

downloadRepos();

var reps = ["stable", "stable64", "libs"];

// determine the releaseID
// see https://developer.github.com/v3/repos/releases/ for more details
var res = downloadJSON("https://api.github.com/repos/tim-lebedkov/packages/releases");
var releases = res[1];

// 14943317 means the release for the tag "2019_Q1"
var releaseID = 0; 
for (var i = 0; i < releases.length; i++) {
    if (releases[i].tag_name === "2019_Q1") {
	releaseID = releases[i].id;
	break;
    }
}

WScript.Echo("Found release ID: " + releaseID);

// print curl version
exec2("\"" + curl + "\" --version");

for (var i = 0; i < reps.length; i++) {
    uploadAllToGithub("https://npackd.appspot.com/rep/xml?tag=" + reps[i], releaseID);
}

processURL("https://npackd.appspot.com/rep/recent-xml?tag=untested", 
		password, false);

// the stable repository is about 3900 KiB
// and should be tested more often
var index = Math.floor(Math.random() * 4000);
if (index < 3000)
	index = 0;
else if (index < 3900)
	index = 1;
else
	index = 2;

// 9 of 10 times only check the newest versions
var newest = Math.random() < 0.9;

processURL("https://npackd.appspot.com/rep/xml?tag=" + reps[index], password, 
		newest);

