const {
  Var,
  Typ,
  All,
  Lam,
  App,
  Box,
  Put,
  Dup,
  U32,
  Num,
  Op1,
  Op2,
  Ite,
  Cpy,
  Sig,
  Par,
  Fst,
  Snd,
  Prj,
  Eql,
  Rfl,
  Sym,
  Rwt,
  Cst,
  Slf,
  New,
  Use,
  Ann,
  Ref,
  shift,
  subst,
  subst_many,
  norm,
  erase,
  equal,
  boxcheck,
  typecheck,
} = require("./fm-core.js");

// :::::::::::::
// :: Parsing ::
// :::::::::::::

// Converts a string to a term
const parse = (code, tokenify) => {
  function is_space(char) {
    return char === " " || char === "\t" || char === "\n" || char === "\r" || char === ";";
  }

  function is_newline(char) {
    return char === "\n";
  }

  function is_name_char(char) {
    return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-".indexOf(char) !== -1;
  }

  function next() {
    if (tokens) tokens[tokens.length - 1][1] += code[idx];
    if (is_newline(code[idx])) {
      row += 1;
      col = 0;
    } else {
      col += 1;
    }
    idx += 1;
  }

  function skip_spaces() {
    while (idx < code.length && is_space(code[idx])) {
      next();
    }
  }

  function next_char() {
    skip_spaces();
    while (code.slice(idx, idx + 2) === "//") {
      if (tokens) tokens.push(["cmm", ""]);
      while (code[idx] !== "\n" && idx < code.length) {
        next();
      }
      if (tokens) tokens.push(["txt", ""]);
      skip_spaces();
    }
  }

  function match_here(string) {
    var sliced = code.slice(idx, idx + string.length);
    if (sliced === string) {
      if (tokens) tokens.push(["sym", ""]);
      for (var i = 0; i < string.length; ++i) {
        next();
      }
      if (tokens) tokens.push(["txt", ""]);
      return true;
    }
    return false;
  }

  function match(string) {
    next_char();
    return match_here(string);
  }

  function is_sigma(string) {
    var i = idx;
    while (i < code.length && is_name_char(code[i])) { ++i; }
    while (i < code.length && is_space(code[i])) { ++i; }
    return code[i] === ":";
  }

  function parse_exact(string) {
    if (!match(string)) {
      var text = "";
      var part = "";
      text += "Parse error: expected '" + string + "' ";
      text += "on line " + (row+1) + ", col " + col + ", but found '" + (code[idx] || "(end of file)") + "' instead. Relevant code:\n";
      for (var ini = idx, il = 0; il < 2 && ini >=          0; --ini) if (code[ini] === "\n") ++il;
      for (var end = idx, el = 0; el < 6 && end < code.length; ++end) if (code[end] === "\n") ++el;
      part += code.slice(ini+1, idx) + "<HERE>" + code.slice(idx, end);
      text += part.split("\n").map((line,i) => ("    " + (row-il+i+1)).slice(-4) + "| " + line).join("\n");
      throw text;
    }
  }

  function parse_string(fn = is_name_char) {
    next_char();
    var name = "";
    while (idx < code.length && fn(code[idx])) {
      name = name + code[idx];
      next();
    }
    return name;
  }

  function parse_term(ctx) {
    var parsed;

    // Parenthesis
    if (match("(")) {
      var term = parse_term(ctx);
      var skip = match(")");
      parsed = term;
    }

    // Type
    else if (match("Type")) {
      parsed = Typ();
    }

    // Lambdas and Forall
    else if (match("{")) {
      var erase = [];
      var names = [];
      var types = [];
      while (idx < code.length) {
        erase.push(match("~"));
        names.push(parse_string());
        types.push(match(":") ? parse_term(ctx.concat(names.slice(0,-1))) : null);
        if (match("}")) break; else parse_exact(",");
      }
      var isall = match("->");
      var islam = match("=>");
      if (!isall && !islam) {
        // TODO: error
      }
      var term = parse_term(ctx.concat(names));
      for (var i = names.length - 1; i >= 0; --i) {
        var ctr = isall ? All : Lam;
        term = ctr(names[i], types[i], term, erase[i]);
        if (isall && !types[i]) {
          throw "Parse error: invalid forall on line " + (row+1) + ", col " + col + ".";
        }
      }
      parsed = term;
    }

    // Duplication
    else if (match("dup ")) {
      var name = parse_string();
      var expr = parse_term(ctx);
      var body = parse_term(ctx.concat([name]));
      parsed = Dup(name, expr, body);
    }

    // Box
    else if (match("!")) {
      var expr = parse_term(ctx);
      parsed = Box(expr);
    }

    // Put
    else if (match("#")) {
      var expr = parse_term(ctx);
      parsed = Put(expr);
    }

    // Let
    else if (match("let ")) {
      var name = parse_string();
      var skip = parse_exact("=");
      var copy = parse_term(ctx);
      var body = parse_term(ctx.concat([name]));
      parsed = subst(body, copy, 0);
    }

    // U32
    else if (match("U32")) {
      parsed = U32();
    }

    // Operation
    else if (match("|")) {
      var num0 = parse_term(ctx);
      var func = parse_string(c => !is_space(c));
      var num1 = parse_term(ctx);
      var skip = parse_exact("|");
      parsed = Op2(func, num0, num1);
    }

    // String
    else if (match("\"")) {
      // Parses text
      var text = "";
      while (code[idx] !== "\"") {
        text += code[idx];
        next();
      }
      next();
      parsed = text_to_term(text);
    }

    // Nat
    //else if (match("^")) {
      //var name = parse_string();
      //var numb = Number(name);
      //parsed = numb_to_term(numb);
    //}

    // PBT
    //else if (match("&")) {
      //var name = parse_string();
      //var numb = Number(name);
      //parsed = numb_to_tree_term(numb);
    //}

    // If-Then-Else
    else if (match("if ")) {
      var cond = parse_term(ctx);
      var pair = parse_term(ctx);
      parsed = Ite(cond, pair);
    }

    // Copy
    else if (match("cpy ")) {
      var name = parse_string();
      let skip = parse_exact("=");
      var numb = parse_term(ctx);
      var body = parse_term(ctx.concat([name]));
      parsed = Cpy(name, numb, body);
    }

    // Sigma / Pair
    else if (match("[")) {
      // Sigma
      if (is_sigma()) {
        var name = parse_string();
        var skip = parse_exact(":");
        var typ0 = parse_term(ctx);
        var eras = match("~");
        var skip = eras ? null : parse_exact(",");
        var typ1 = parse_term(ctx.concat([name]));
        var skip = parse_exact("]");
        parsed = Sig(name, typ0, typ1, eras);
      // Pair
      } else {
        var val0 = parse_term(ctx);
        var eras = match("~");
        var skip = eras ? null : parse_exact(",");
        var val1 = parse_term(ctx);
        var skip = parse_exact("]");
        parsed = Par(val0, val1, eras);
      }
    }

    // Pair (If-Then-Else sugar)
    else if (match("then:")) {
      var val0 = parse_term(ctx);
      var skip = parse_exact("else:");
      var val1 = parse_term(ctx);
      parsed = Par(val0, val1, false);
    }

    // First
    else if (match("fst ")) {
      var pair = parse_term(ctx);
      parsed = Fst(pair, false);
    }

    // First (erased)
    else if (match("~fst ")) {
      var pair = parse_term(ctx);
      parsed = Fst(pair, true);
    }

    // Second
    else if (match("snd ")) {
      var pair = parse_term(ctx);
      parsed = Snd(pair, false);
    }

    // Second (erased)
    else if (match("~snd ")) {
      var pair = parse_term(ctx);
      parsed = Snd(pair, true);
    }

    // Projection
    else if (match("get ")) {
      var skip = parse_exact("[");
      var nam0 = parse_string();
      var skip = parse_exact(",");
      var eras = match("~");
      var nam1 = parse_string();
      var skip = parse_exact("]");
      var pair = parse_term(ctx);
      var body = parse_term(ctx.concat([nam0, nam1]));
      parsed = Prj(nam0, nam1, pair, body, eras);
    }

    // Equality
    else if (match("<")) {
      var val0 = parse_term(ctx);
      var skip = parse_exact("==");
      var val1 = parse_term(ctx);
      var skip = parse_exact(">");
      parsed = Eql(val0, val1);
    }

    // Reflexivity
    else if (match("rfl")) {
      var expr = parse_term(ctx);
      parsed = Rfl(expr);
    }

    // Symmetry
    else if (match("sym")) {
      var prof = parse_term(ctx);
      parsed = Sym(prof);
    }

    // Rewrite
    else if (match("rwt")) {
      var prof = parse_term(ctx);
      var skip = parse_exact("<");
      var name = parse_string();
      var skip = parse_exact("@");
      var type = parse_term(ctx.concat([name]));
      var skip = parse_exact(">");
      var expr = parse_term(ctx);
      parsed = Rwt(prof, name, type, expr);
    }

    // Cast
    else if (match("cst")) {
      var prof = parse_term(ctx);
      var val0 = parse_term(ctx);
      var val1 = parse_term(ctx);
      parsed = Cst(prof, val0, val1);
    }

    // Annotation
    else if (match(":")) {
      var type = parse_term(ctx);
      var expr = parse_term(ctx);
      parsed = Ann(type, expr, false);
    }

    // Identiy
    else if (match("=")) {
      var expr = parse_term(ctx);
      parsed = expr;
    }

    // Slf
    else if (match("$")) {
      var name = parse_string();
      var type = parse_term(ctx.concat([name]));
      parsed = Slf(name, type);
    }

    // New
    else if (match("@")) {
      var type = parse_term(ctx);
      var expr = parse_term(ctx);
      parsed = New(type, expr);
    }

    // Use
    else if (match("%")) {
      var expr = parse_term(ctx);
      parsed = Use(expr);
    }

    // Case syntax sugar
    else if (match("case<")) {
      // ? ADT val -> motive
      // | 
      var adt_name = parse_string();
      var skip = parse_exact(">");
      if (!adts[adt_name]) {
        throw "Parse error: used case-syntax on undefined type `" + adt_name + "`.";
      }
      var {adt_name, adt_pram, adt_indx, adt_ctor} = adts[adt_name];
      var term = parse_term(ctx);
      var cses = [];
      for (var c = 0; c < adt_ctor.length; ++c) {
        var skip = parse_exact("|");
        var skip = parse_exact(adt_ctor[c][0]);
        var skip = parse_exact("=>");
        var ctors = adt_ctor[c][1];
        cses[c] = parse_term(ctx.concat(adt_ctor[c][1].map(([name,type]) => name)));
        for (var i = 0; i < ctors.length; ++i) {
          cses[c] = Lam(ctors[ctors.length - i - 1][0], null, cses[c], ctors[ctors.length - i - 1][2]);
        }
      }
      var skip = parse_exact(":");
      var moti = parse_term(ctx.concat(adt_indx.map(([name,type]) => name)).concat(["self"]));
      for (var i = 0; i < adt_indx.length; ++i) {
        var moti = Lam(adt_indx[i][adt_indx.length - i - 1], null, moti, false);
      }
      var moti = Lam("self", null, moti, false);
      var term = Use(term);
      var term = App(term, moti, true);
      for (var i = 0; i < cses.length; ++i) {
        var term = App(term, cses[i], false);
      }
      return term;
    }

    // Variable / Reference
    else {
      if (tokens) tokens.push(["???", ""]);
      var name = parse_string();
      var numb = Number(name);
      if (!isNaN(numb)) {
        parsed = Num(numb >>> 0);
        if (tokens) tokens[tokens.length - 1][0] = "num";
      } else {
        var skip = 0;
        while (match_here("'")) {
          skip += 1;
        }
        for (var i = ctx.length - 1; i >= 0; --i) {
          if (ctx[i] === name) {
            if (skip === 0) break;
            else skip -= 1;
          }
        }
        if (i === -1) {
          parsed = Ref(name, false);
          if (tokens) tokens[tokens.length - 1][0] = "ref";
        } else {
          parsed = Var(ctx.length - i - 1);
          if (tokens) tokens[tokens.length - 1][0] = "var";
        }
      }
      if (tokens) tokens.push(["txt", ""]);
    }

    var erased = false;
    while (match_here("(") || (erased = match_here("<"))) {
      var term = parsed;
      while (idx < code.length) {
        var eras = erased || match("~");
        var argm = parse_term(ctx);
        var term = App(term, argm, eras);
        if (erased && match(">") || match(")")) break;
        else parse_exact(",");
      }
      parsed = term;
      erased = false;
    }

    return parsed;
  }

  var tokens = tokenify ? [["txt",""]] : null;
  var idx = 0;
  var row = 0;
  var col = 0;
  var defs = {};
  var adts = {};
  while (idx < code.length) {
    next_char();
    // Datatype syntax
    if (match("T ")) {
      var adt_pram = [];
      var adt_indx = [];
      var adt_ctor = [];
      var adt_name = parse_string();
      var adt_ctx = [adt_name];
      if (match("<")) {
        while (idx < code.length) {
          var eras = false;
          var name = parse_string(); 
          var skip = parse_exact(":");
          var type = parse_term(adt_pram.map((([name,type]) => name)));
          adt_pram.push([name, type, eras]);
          if (match(">")) break; else parse_exact(",");
        }
      }
      var adt_ctx = adt_ctx.concat(adt_pram.map(([name,type]) => name));
      if (match("{")) {
        while (idx < code.length) {
          //var eras = match("~");
          var eras = false;
          var name = parse_string(); 
          var skip = parse_exact(":");
          var type = parse_term(adt_ctx.concat(adt_indx.map((([name,type]) => name))));
          adt_indx.push([name, type, eras]);
          if (match("}")) break; else parse_exact(",");
        }
      }
      while (match("|")) {
        var ctor_name = parse_string();
        var ctor_flds = [];
        if (match("{")) {
          while (idx < code.length) {
            var eras = match("~");
            var name = parse_string();
            var skip = parse_exact(":");
            var type = parse_term(adt_ctx.concat(ctor_flds.map(([name,type]) => name)));
            ctor_flds.push([name, type, eras]);
            if (match("}")) break; else parse_exact(",");
          }
        }
        if (match(":")) {
          var ctor_type = parse_term(adt_ctx.concat(ctor_flds.map(([name,type]) => name)));
        } else {
          var ctor_indx = [];
          while (match("@")) {
            ctor_indx.push(parse_term(adt_ctx.concat(ctor_flds.map(([name,type]) => name))));
          }
          var ctor_type = Var(-1 + ctor_flds.length + adt_pram.length + 1);
          for (var p = 0; p < adt_pram.length; ++p) {
            ctor_type = App(ctor_type, Var(-1 + ctor_flds.length + adt_pram.length + p), false);
          }
          for (var i = 0; i < ctor_indx.length; ++i) {
            ctor_type = App(ctor_type, ctor_indx[i], false);
          }
        }
        adt_ctor.push([ctor_name, ctor_flds, ctor_type]);
      }
      var adt = {adt_pram, adt_indx, adt_ctor, adt_name};
      defs[adt_name] = derive_adt_type(adt);
      for (var c = 0; c < adt_ctor.length; ++c) {
        defs[adt_name + "." + adt_ctor[c][0]] = derive_adt_ctor(adt, c);
      }
      adts[adt_name] = adt;
    // Definitions
    } else {
      if (tokens) tokens.push(["def", ""]);
      var name = parse_string();
      if (tokens) tokens.push(["txt", ""]);
      if (name.length > 0) {
        // Typed definition syntax-sugar
        if (match(":")) {
          var cased = [];
          var erase = [];
          var names = [];
          var types = [];
          if (match("{")) {
            while (idx < code.length) {
              cased.push(match("|"));
              erase.push(match("~"));
              names.push(parse_string());
              parse_exact(":");
              types.push(parse_term(names.slice(0,-1)));
              if (match("}")) break; else parse_exact(",");
            }
            var skip = parse_exact("->");
          }
          var type = parse_term(names);

          // With compact case-analysis
          if (cased.filter(x => x).length > 0) {
            var cadts = [];
            for (var i = 0; i < cased.length; ++i) {
              if (cased[i]) {
                // Right now, we can only build the compact case-analysis syntax
                // if all the types on the annotation are refs to ADTs in scope.
                // This could be improved if the parser kept track of ctx types.
                var adt_ref = types.map(function go(x) { return x[0] === "App" ? go(x[1].func) : x; });
                if (adt_ref[i][0] !== "Ref" || !adts[adt_ref[i][1].name]) {
                  throw "Couldn't find the ADT for the `" + names[i] + "` case of `" + name + "`.";
                }
                cadts[i] = adts[adt_ref[i][1].name]; 
              } else {
                cadts[i] = null;
              }
            }

            var case_tree = {};
            (function parse_case_tree(ctx, a, branch) {
              if (a < cadts.length) {
                if (cadts[a] === null) {
                  return parse_case_tree(ctx, a + 1, branch);
                } else {
                  var {adt_name, adt_pram, adt_indx, adt_ctor} = cadts[a];
                  for (var c = 0; c < adt_ctor.length; ++c) {
                    var skip = parse_exact("|");
                    var skip = parse_exact(adt_ctor[c][0]);
                    var vars = adt_ctor[c][1].map((([name,type,eras]) => names[a] + "." + name));
                    parse_case_tree(ctx.concat(vars), a + 1, branch.concat([adt_ctor[c][0]]));
                  }
                }
              } else {
                //console.log("building branch: ", branch, "with ctx: ", JSON.stringify(ctx));
                var skip = parse_exact("=");
                var term = parse_term(ctx);
                case_tree[branch.join("_")] = term;
              }
            })(names, 0, []);
            var term = derive_dependent_match({names, types, cased, erase, cadts}, type, case_tree);
            //console.log("->", show(term, names));
          }

          // Without compact case-analysis
          else {
            var term = parse_term(names);
          }

          for (var i = names.length - 1; i >= 0; --i) {
            type = All(names[i], types[i], type, erase[i]);
            term = Lam(names[i], types[i], term, erase[i]);
          }
          defs[name] = Ann(type, term);
        // Untyped definition
        } else {
          var term = parse_term([]);
          defs[name] = term;
        }
      }
    }
    next_char();
  }

  return tokens ? {defs, tokens} : defs;
}

// :::::::::::::::::::::
// :: Stringification ::
// :::::::::::::::::::::

// Generates a name
const gen_name = (n) => {
  var str = "";
  ++n;
  while (n > 0) {
    --n;
    str += String.fromCharCode(97 + n % 26);
    n = Math.floor(n / 26);
  }
  return str;
};

// Converts a term to a string
const show = ([ctor, args], nams = []) => {
  switch (ctor) {
    case "Var":
      var name = nams[nams.length - args.index - 1];
      if (!name) {
        return "^" + args.index;
      } else {
        var suff = "";
        for (var i = 0; i < args.index - 1; ++i) {
          if (nams[nams.length - i - 1] === name) {
            var suff = suff + "'";
          }
        }
        return name + suff;
      }
    case "Typ":
      return "Type";
    case "All":
      var term = [ctor, args];
      var erase = [];
      var names = [];
      var types = [];
      while (term[0] === "All") {
        erase.push(term[1].eras);
        names.push(term[1].name);
        types.push(show(term[1].bind, nams.concat(names.slice(0,-1))));
        term = term[1].body;
      }
      var text = "{";
      for (var i = 0; i < names.length; ++i) {
        text += erase[i] ? "~" : "";
        text += names[i] + " : " + types[i];
        text += i < names.length - 1 ? ", " : "";
      }
      text += "} -> ";
      text += show(term, nams.concat(names));
      return text;
    case "Lam":
      var term = [ctor, args];
      var numb = null;
      var erase = [];
      var names = [];
      var types = [];
      while (term[0] === "Lam") {
        numb = term_to_numb(term);
        if (numb !== null) {
          break;
        } else {
          erase.push(term[1].eras);
          names.push(term[1].name);
          types.push(term[1].bind ? show(term[1].bind, nams.concat(names.slice(0,-1))) : null);
          term = term[1].body;
        }
      }
      var text = "{";
      for (var i = 0; i < names.length; ++i) {
        text += erase[i] ? "~" : "";
        text += names[i] + (types[i] !== null ? " : " + types[i] : "");
        text += i < names.length - 1 ? ", " : "";
      }
      text += "} => ";
      if (numb !== null) {
        text += "%" + Number(numb);
      } else {
        text += show(term, nams.concat(names));
      }
      return text;
    case "App":
      var text = ")";
      var term = [ctor, args];
      while (term[0] === "App") {
        text = (term[1].func[0] === "App" ? ", " : "") + (term[1].eras ? "~" : "") + show(term[1].argm, nams) + text;
        term = term[1].func;
      }
      return "(" + show(term, nams) + ")" + "(" + text;
    case "Box":
      var expr = show(args.expr, nams);
      return "(!" + expr + ")";
    case "Put":
      var expr = show(args.expr, nams);
      return "(#" + expr + ")";
    case "Dup":
      var name = args.name;
      var expr = show(args.expr, nams);
      var body = show(args.body, nams.concat([name]));
      return "dup " + name + " = " + expr + "; " + body;
    case "U32":
      return "U32";
    case "Num":
      return args.numb.toString();
    case "Op1":
    case "Op2":
      var func = args.func;
      var num0 = show(args.num0, nams);
      var num1 = show(args.num1, nams);
      return "|" + num0 + " " + func + " " + num1 + "|";
    case "Ite":
      var cond = show(args.cond, nams);
      var pair = show(args.pair, nams);
      return "(if " + cond + " " + pair + ")";
    case "Cpy":
      var name = args.name;
      var numb = show(args.numb, nams);
      var body = show(args.body, nams.concat([name]));
      return "cpy " + name + " = " + numb + "; " + body;
    case "Sig":
      var name = args.name;
      var typ0 = show(args.typ0, nams);
      var typ1 = show(args.typ1, nams.concat([name]));
      var comm = args.eras ? " ~ " : ",";
      return "[" + name + " : " + typ0 + comm + typ1 + "]";
    case "Par":
      var text = term_to_text([ctor, args]);
      if (text !== null) {
        return "\"" + text + "\"";
      } else {
        var val0 = show(args.val0, nams);
        var val1 = show(args.val1, nams);
        var eras = args.eras ? "~" : "";
        return "[" + val0 + ", " + eras + val1 + "]";
      }
    case "Fst":
      var pair = show(args.pair, nams);
      var eras = args.eras ? "~" : "";
      return "(" + eras + "fst " + pair + ")";
    case "Snd":
      var pair = show(args.pair, nams);
      var eras = args.eras ? "~" : "";
      return "(" + eras + "snd " + pair + ")";
    case "Prj":
      var nam0 = args.nam0;
      var nam1 = args.nam1;
      var pair = show(args.pair, nams);
      var body = show(args.body, nams.concat([nam0, nam1]));
      var eras = args.eras ? "~" : "";
      return "get [" + nam0 + "," + eras + nam1 + "] = " + pair + "; " + body;
    case "Eql":
      var val0 = show(args.val0, nams);
      var val1 = show(args.val1, nams);
      return "<" + val0 + " == " + val1 + ">";
    case "Rfl":
      var expr = show(args.expr, nams);
      return "(rfl " + expr + ")";
    case "Sym":
      var prof = show(args.prof, nams);
      return "(sym " + prof + ")";
    case "Rwt":
      var prof = show(args.prof, nams);
      var name = args.name;
      var type = show(args.type, nams.concat([name]));
      var expr = show(args.expr, nams);
      return "(rwt " + prof + " <" + name + " @ " + type + "> " + expr + ")";
    case "Cst":
      var prof = show(args.prof, nams);
      var val0 = show(args.val0, nams);
      var val1 = show(args.val1, nams);
      return "(cst " + prof + " " + val0 + " " + val1 + ")";
    case "Slf":
      var name = args.name;
      var type = show(args.type, nams.concat([name]));
      return "$" + name + " " + type;
    case "New":
      var type = show(args.type, nams);
      var expr = show(args.expr, nams);
      return "@" + type + " " + expr;
    case "Use":
      var expr = show(args.expr, nams);
      return "%" + expr;
    case "Ann":
      var expr = show(args.expr, nams);
      return expr;
    case "Ref":
      return args.name;
  }
};

// :::::::::::::::::::
// :: Syntax Sugars ::
// :::::::::::::::::::

// Converts an utf-8 string to a λ-encoded term
const text_to_term = (text) => {
  // Converts UTF-8 to bytes
  var bytes = [].slice.call(new TextEncoder("utf-8").encode(text), 0);

  // Converts bytes to uints
  while (bytes.length % 4 !== 0) {
    bytes.push(0);
  }
  var nums = new Uint32Array(new Uint8Array(bytes).buffer);

  // Converts uints to C-List of nums
  var term = Var(0);
  for (var i = nums.length - 1; i >= 0; --i) {
    term = App(App(Var(1), Num(nums[i]), false), term, false);
  }
  term = Par(Num(0x74786574), Lam("c", null, Dup("c", Var(0), Put(Lam("n", null, term, false))), false), false);
  return term;
}

// Converts a λ-encoded term to a string, if possible
const term_to_text = (term) => {
  try {
    if (term[1].val0[1].numb === 0x74786574) {
      try {
        term = term[1].val1[1].body[1].body[1].expr[1].body;
      } catch(e) {
        term = term[1].val1[1].body[1].body;
      }
      var nums = [];
      while (term[0] !== "Var") {
        if (term[1].func[1].func[1].index !== 1) {
          return null;
        }
        nums.push(term[1].func[1].argm[1].numb);
        term = term[1].argm;
      }
      if (term[1].index !== 0) {
        return null;
      }
      return new TextDecoder("utf-8").decode(new Uint8Array(new Uint32Array(nums).buffer));
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}

// Converts a number to a λ-encoded nat for repeated application (bounded for-loop)
const numb_to_term = (numb) => {
  var term = Var(0);
  var log2 = Math.floor(Math.log(numb) / Math.log(2));
  for (var i = 0; i < log2 + 1; ++i) {
    term = (numb >>> (log2 - i)) & 1 ? App(Var(i + 1), term, false) : term;
  }
  term = Put(Lam("x", null, term, false));
  for (var i = 0; i < log2; ++i) {
    term = Dup("s" + (log2 - i), Put(Lam("x", null, App(Var(1), App(Var(1), Var(0), false), false), false)), term);
  }
  term = Lam("s", null, Dup("s0", Var(0), term), false);
  return term;
}

// Converts a number to a λ-encoded nat for repeated application (bounded for-loop)
const numb_to_tree_term = (numb) => {
  var term = Put(Var(0));
  for (var i = 0; i < numb; ++i) {
    term = Dup("b" + (numb - i - 1), Put(App(App(Var(numb - i), Var(0), false), Var(0), false)), term);
  }
  term = Dup("n", Var(1), term);
  term = Dup("b", Var(1), term);
  term = Lam("n", null, term, false);
  term = Lam("b", null, term, false);
  return term;
}

// Converts a λ-encoded nat to a number, if possible
const term_to_numb = (term) => {
  return null;
  try {
    try {
      term = term[1].body[1].body[1].expr[1].body;
    } catch(e) {
      term = term[1].body[1].body;
    }
    var count = 0;
    while (term[0] !== "Var") {
      if (term[1].func[1].index !== 1) {
        return null;
      }
      count++;
      term = term[1].argm;
    }
    if (term[1].index !== 0) {
      return null;
    }
    return count;
  } catch (e) {
    return null;
  }
}

// Syntax sugars for datatypes. They transform a statement like:
// 
//   data ADT <p0 : Param0, p1 : Param1...> {i0 : Index0, i1 : Index1}
//   | ctr0 {ctr_fld0 : Ctr0_Fld0, ctr0_fld1 : Ctr0_Fld1, ...} : Cr0Type 
//   | ctr1 {ctr_fld0 : Ctr0_Fld0, ctr0_fld1 : Ctr0_Fld1, ...} : Cr0Type 
//   | ...
//
// on its corresponding self-encoded datatype:
//
//   def ADT
//   = {p0 : Param0, p1 : Param1, ..., i0 : Index0, i1 : Index1, ...} =>
//     : Type
//     $ self
//     {~P   : {i0 : Index0, i1 : Index1, ..., wit : (ADT i0 i1...)} -> Type} ->
//     {ctr0 : {ctr0_fld0 : Ctr0_Fld0, ctr0_fld1 : Ctr0_Fld1, ...} -> (Ctr0Type[ADT <- P] (ADT.ctr0 Param0 Param1... ctr0_fld0 ctr0_fld1 ...))} ->
//     {ctr1 : {ctr1_fld0 : Ctr1_Fld0, ctr1_fld1 : Ctr1_Fld1, ...} -> (Ctr0Type[ADT <- P] (ADT.ctr1 Param0 Param1... ctr1_fld1 ctr0_fld1 ...))} ->
//     ... ->
//     (P i0 i1... self)
//  
//   def ADT.ctr0
//   = {~p0 : Param0, ~p1 : Param1, ..., ctr0_fld0 : Ctr0_Fld0, ctr1_fld1 : Ctr1_Fld1, ...} =>
//     : Ctr0Type
//     @ Ctr0Type
//       {~P, ctr0, ctr1, ...} => 
//       (ctr0 ctr0_fld0 ctr0_fld1 ...)
//
//   (...)
const derive_adt_type = ({adt_pram, adt_indx, adt_ctor, adt_name}) => {
  return (function adt_arg(p, i) {
    // ... {p0 : Param0, p1 : Param1...} ...
    if (p < adt_pram.length) {
      return Lam(adt_pram[p][0], adt_pram[p][1], adt_arg(p + 1, i), adt_pram[p][2]);
    // ... {i0 : Index0, i1 : Index...} ...
    } else if (i < adt_indx.length) {
      var substs = [Ref(adt_name)];
      for (var P = 0; P < p; ++P) {
        substs.push(Var(-1 + i + p - P));
      }
      return Lam(adt_indx[i][0], subst_many(adt_indx[i][1], substs, i), adt_arg(p, i + 1), adt_indx[i][2]);
    } else {
      return (
        // ... : Type ...
        Ann(Typ(),
        // ... $ self ...
        Slf("self",
        // ... P : ...
        All("P",
          (function motive(i) {
            // ... {i0 : Index0, i1 : Index1...} ...
            if (i < adt_indx.length) {
              var substs = [Ref(adt_name)];
              for (var P = 0; P < p; ++P) {
                substs.push(Var(-1 + i + 1 + adt_indx.length + p - P));
              }
              return All(adt_indx[i][0], subst_many(adt_indx[i][1], substs, i), motive(i + 1), adt_indx[i][2]);
            // ... {wit : (ADT i0 i1...)} -> Type ...
            } else {
              var wit_t = Ref(adt_name);
              for (var P = 0; P < adt_pram.length; ++P) {
                wit_t = App(wit_t, Var(-1 + i + 1 + i + adt_pram.length - P), adt_pram[P][2]); 
              }
              for (var I = 0; I < i; ++I) {
                wit_t = App(wit_t, Var(-1 + i - I), adt_indx[I][2]);
              }
              return All("wit", wit_t, Typ(), false);
            }
          })(0),
        (function ctor(i) {
          if (i < adt_ctor.length) {
            // ... ctrX : ...
            return All(adt_ctor[i][0], (function field(j) {
              var subst_prams = [];
              for (var P = 0; P < adt_pram.length; ++P) {
                subst_prams.push(Var(-1 + j + i + 1 + 1 + adt_indx.length + adt_pram.length - P));
              }
              // ... {ctrX_fldX : CtrX_FldX, ctrX_fld1 : CtrX_Fld1, ...} -> ...
              if (j < adt_ctor[i][1].length) {
                var sub = [Ref(adt_name)].concat(subst_prams);
                var typ = subst_many(adt_ctor[i][1][j][1], sub, j);
                return All(adt_ctor[i][1][j][0], typ, field(j + 1), adt_ctor[i][1][j][2]);
              // ... (CtrXType[ADT <- P] (ADT.ctrX ParamX Param1... ctrX_fldX ctrX_fld1 ...)) -> ...
              } else {
                var typ = adt_ctor[i][2];
                var sub = [Var(-1 + j + i + 1)].concat(subst_prams);
                var typ = subst_many(adt_ctor[i][2], sub, j);
                var rem = typ;
                for (var I = 0; I < adt_indx.length; ++I) {
                  rem = rem[1].func;
                }
                rem[0] = "Var";
                rem[1] = {index: -1 + i + j + 1};
                var wit = Ref(adt_name + "." + adt_ctor[i][0]);
                for (var P = 0; P < adt_pram.length; ++P) {
                  var wit = App(wit, Var(-1 + j + i + 1 + 1 + adt_indx.length + adt_pram.length - P), true);
                }
                for (var F = 0; F < adt_ctor[i][1].length; ++F) {
                  var wit = App(wit, Var(-1 + j - F), adt_ctor[i][1][F][2]);
                }
                return App(typ, wit, false);
              }
            })(0),
            ctor(i + 1),
            false);
          } else {
            // ... (P i0 i1... self)
            var ret = Var(adt_ctor.length + 1 - 1);
            for (var i = 0; i < adt_indx.length; ++i) {
              var ret = App(ret, Var(adt_ctor.length + 1 + 1 + adt_indx.length - i - 1), adt_indx[i][2]); 
            }
            var ret = App(ret, Var(adt_ctor.length + 1 + 1 - 1), false);
            return ret;
          }
        })(0),
        true))));
    }
  })(0, 0);
}

const derive_adt_ctor = ({adt_pram, adt_indx, adt_ctor, adt_name}, c) => {
  return (function arg(p, i, f) {
    var substs = [Ref(adt_name)];
    for (var P = 0; P < p; ++P) {
      substs.push(Var(-1 + f + p - P));
    }
    // {~p0 : Param0, ~p1 : Param1...} ...
    if (p < adt_pram.length) {
      return Lam(adt_pram[p][0], adt_pram[p][1], arg(p + 1, i, f), true);
    // ... {ctr0_fld0 : Ctr0_Fld0, ctr1_fld1 : Ctr1_Fld1, ...} ...
    } else if (f < adt_ctor[c][1].length) {
      return Lam(adt_ctor[c][1][f][0], subst_many(adt_ctor[c][1][f][1], substs, f), arg(p, i, f + 1), adt_ctor[c][1][f][2]);
    } else {
      var type = subst_many(adt_ctor[c][2], substs, f);
      // ... : CtrXType {~P} ...
      return Ann(type, New(type, Lam("P", null, (function opt(k) {
        // ... {ctr0, ctr1...} ...
        if (k < adt_ctor.length) {
          return Lam(adt_ctor[k][0], null, opt(k + 1), false);
        // (ctrX ctrX_fld0 ctrX_fld1 ...)
        } else {
          var sel = Var(-1 + adt_ctor.length - c);
          for (var F = 0; F < adt_ctor[c][1].length; ++F) {
            var sel = App(sel, Var(-1 + adt_ctor.length + 1 + adt_ctor[c][1].length - F), adt_ctor[c][1][F][2]);
          }
          return sel;
        }
      })(0), true)), false);
    }
  })(0, adt_indx.length, 0);
}

const derive_dependent_match = ({names, types, cased, erase, cadts}, type, case_tree) => {
  return (function arg(a, last_carry = 0, carry = [], branch = []) {
    //console.log("building arg ", a);

    // For each argument to be projected
    if (a < names.length) {
      if (!cadts[a]) {
        //console.log("not an adt");
        return arg(a + 1, last_carry, carry, branch);
      } else {
        var {adt_name, adt_pram, adt_indx, adt_ctor} = cadts[a];
        //console.log("it is the adt", adt_name);

        // Creates the inductive pattern-matching function of this argument
        var term = Use(Var(-1 + names.length - a));

        // Applies the motive of this argument
        var term = App(term, (function motive_idxs(i) {
          if (i < adt_indx.length) {
            return Lam(adt_indx[i][0], null, motive_idxs(i + 1), false);
          } else {
            return Lam("self", null, (function motive_others(v) {
              var substs = [];
              for (var V = 0; V < v; ++V) {
                var to_self = (v < a ? v : v - 1) + (v >= names.length ? carry.length : 0);
                substs.push(Var(to_self - (V < a ? V + 1 : V === a ? 0 : V)));
              }
              if (v < names.length) {
                if (v === a) {
                  return motive_others(v + 1);
                } else {
                  return All(names[v], subst_many(types[v], substs, 0), motive_others(v + 1), v < a && cased[v]);
                }
              } else {
                return (function motive_carrys(k) {
                  if (k < carry.length) {
                    return All(carry[k][0], carry[k][1], motive_carrys(k + 1), false);
                  } else {
                    return subst_many(type, substs, 0);
                  }
                })(0);
              }
            })(0), false);
          }
        })(0), true);

        // Applies each case of this argument
        for (var c = 0; c < adt_ctor.length; ++c) {
          //console.log("building case", adt_ctor[c][0]);
          term = App(term, (function cases(f, v, k) {
            // Case fields
            if (f < adt_ctor[c][1].length) {
              //console.log("field", adt_ctor[c][1][f]);
              return Lam(names[a] + "." + adt_ctor[c][1][f][0], null, cases(f + 1, v, k), adt_ctor[c][1][f][2]);
            // Variables to hold the other values
            } else if (v < names.length) {
              // If this is the matched value, rebuild it
              if (v === a) {
                var wit = Ref(adt_name + "." + adt_ctor[c][0]);
                for (var F = 0; F < f; ++F) {
                  wit = App(wit, Var(-1 + v + f - F), adt_ctor[c][1][F][2]);
                }
                return subst(cases(f, v + 1, k), wit, 0);
              // Otherwise, just create a lam for it
              } else {
                return Lam(names[v], null, cases(f, v + 1, k), v < a && cased[v]);
              }
            // Variables to hold carried values
            } else if (k < carry.length) {
              return Lam(carry[k][0], null, cases(f, v, k + 1), false);
            // Body of the case
            } else {
              var new_carry = adt_ctor[c][1].map(([name,type,eras]) => {
                return [names[a] + "." + name, subst(type, Ref(adt_name), 0)];
              });
              //console.log("extending carry", JSON.stringify(carry), JSON.stringify(new_carry));
              var case_body = arg(a + 1, adt_ctor[c][1].length, carry.concat(new_carry), branch.concat([adt_ctor[c][0]]));
              //console.log("ue", a + 1, names.length);
              //if (a + 1 < names.length) {
                //for (var C = 0; C < adt_ctor[c][1].length; ++C) {
                  //case_body = App(case_body, Var(-1 + (v - 1) + adt_ctor[c][1].length - C), false);
                  //case_body = App(case_body, Var(-1 + carry.length + names.length + adt_ctor[c][1].length - C), false);
                //}
              //}
              return case_body;
            }
          })(0, 0, 0), false);
        }

        // Applies other values
        for (var v = 0; v < names.length; ++v) {
          if (v !== a) {
            term = App(term, Var(-1 + carry.length - last_carry + names.length - v), v < a && cased[v]);
          }
        }

        // Applies old carry values
        for (var k = 0; k < carry.length - last_carry; ++k) {
          term = App(term, Var(-1 + carry.length - last_carry - k), false);
        }

        // Applies new carry values
        for (var k = 0; k < last_carry; ++k) {
          term = App(term, Var(-1 + carry.length + names.length - k), false);
        }

        return term;
      }

    // Done (i.e., this is the deepest spot, so, put the nth pattern-matching body here)
    } else {
      var substs = [];

      // Substitutes other values
      for (var v = 0; v < names.length; ++v) {
        if (v !== a) {
          substs.push(Var(-1 + carry.length - last_carry + names.length - v));
        }
      }

      // Substitutes old carry values
      for (var k = 0; k < carry.length - last_carry; ++k) {
        substs.push(Var(-1 + carry.length - last_carry - k));
      }

      // Substitutes new carry values
      for (var k = 0; k < last_carry; ++k) {
        substs.push(Var(-1 + carry.length + names.length - k));
      }
      var term = case_tree[branch.join("_")];
      var term = subst_many(term, substs, 0);
      return term;
    }
  })(0);
}

module.exports = {
  Var,
  Typ,
  All,
  Lam,
  App,
  Box,
  Put,
  Dup,
  U32,
  Num,
  Op1,
  Op2,
  Ite,
  Cpy,
  Sig,
  Par,
  Fst,
  Snd,
  Prj,
  Eql,
  Rfl,
  Sym,
  Rwt,
  Cst,
  Slf,
  New,
  Use,
  Ann,
  Ref,
  shift,
  subst,
  subst_many,
  norm,
  erase,
  equal,
  boxcheck: boxcheck(show),
  typecheck: typecheck(show),
  parse,
  gen_name,
  show,
  text_to_term,
  term_to_text,
  numb_to_term,
  numb_to_tree_term,
  term_to_numb,
  derive_adt_type,
  derive_adt_ctor,
  derive_dependent_match
};
