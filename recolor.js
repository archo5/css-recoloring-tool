
"use strict";

function compile_recolor_func( func )
{
	var fullfunc = "(function(hexcolor,color){" + func + "})";
	try
	{
		return eval( fullfunc );
	}
	catch( e )
	{
		return "### FAILED TO COMPILE FUNCTION: " + e + " ###";
	}
}

function clamp255( val ){ return val < 0 ? 0 : ( val > 255 ? 255 : val ); }
function close255( val ){ val = val % 256; return val < 0 ? val + 256 : val; }
function clamp1f( val ){ return val < 0 ? 0 : ( val > 1 ? 1 : val ); }

function hex255( val )
{
	val = Math.round( clamp255( val ) );
	var n = val.toString(16);
	return ("0"+n).substr(-2);
}

function rc_gen_hex( color )
{
	return "#" + hex255( color[0] ) + hex255( color[1] ) + hex255( color[2] );
}

function rc_gen_rgba( color )
{
	return "rgba("
		+ Math.round( clamp255( color[0] ) ) + ","
		+ Math.round( clamp255( color[1] ) ) + ","
		+ Math.round( clamp255( color[2] ) ) + ","
		+ clamp1f( color[3] ) + ")";
}

function rc_parse_color( str )
{
	// csscolorparser.js
	return parseCSSColor( str );
}

function rc_normalize_color( color )
{
	if( color instanceof Array )
	{
		if( color.length < 3 || color.length > 4 )
			return null;
		if( color.length < 4 )
			color.push( 1 );
		for( var i = 0; i < 4; ++i )
		{
			if( !isFinite( color[i] ) )
				throw "NaN detected in color value";
		}
		return color;
	}
	return rc_parse_color( color );
}

function rc_apply_color( value, color )
{
	if( color[3] == 1 )
		value.value = rc_gen_hex( color );
	else
		value.value = rc_gen_rgba( color );
}

function rc_process_value( value, params, errlist )
{
	var color = rc_parse_color( value.value );
	if( color )
	{
		var newcolor = null;
		try
		{
			newcolor = params.func( rc_gen_hex( color ), color );
			var newcolor2 = rc_normalize_color( newcolor );
			rc_apply_color( value, newcolor2 );
			return true;
		}
		catch( e )
		{
			errlist.push( "Failed to call function with color '" + value.value + ", returned value: " + newcolor + "', error: " + e );
			return null;
		}
	}
	return false;
}

function rc_process_decl( decl, params, errlist )
{
	var i, any = false;
	
	if( decl.values )
	{
		for( i = 0; i < decl.values.length; ++i )
		{
			var res = rc_process_value( decl.values[i], params, errlist );
			if( res )
				any = true;
		}
	}
	
	return any;
}

function rc_insert_bodyclass( sels, cls )
{
	var sellist = sels.split( "," );
	for( var i = 0; i < sellist.length; ++i )
	{
		var sel = sellist[i];
		if( sel.match( /(^|\s)html($|\s|\.\#)/i ) )
		{
			// found html, replace at that spot
			sel = sel.replace( /(^|\s)html($|\s|\.\#)/i, "html." + cls + " " );
		}
		else
		{
			// prefix with class
			sel = "." + cls + " " + sel;
		}
		sellist[i] = sel;
	}
	return sellist.join( "," );
}

function rc_process( item, params, errlist )
{
	var i, newerrlist = [];
	
	if( item.mSelectorText )
	{
		item.mSelectorText = rc_insert_bodyclass( item.mSelectorText, params.bodyclass );
	}
	
	if( item.cssRules )
	{
		for( i = 0; i < item.cssRules.length; ++i )
		{
			if( !rc_process( item.cssRules[ i ], params, errlist ) )
				item.cssRules.splice( i--, 1 );
		}
	}
	
	if( item.declarations )
	{
		for( i = 0; i < item.declarations.length; ++i )
		{
			if( !rc_process_decl( item.declarations[i], params, newerrlist ) )
				item.declarations.splice( i--, 1 );
		}
	}
	
	if( newerrlist.length )
	{
		errlist.push( "At line " + item.currentLine + ", declaration '" + item.parsedCssText + "'" );
		for( i = 0; i < newerrlist.length; ++i )
			errlist.push( newerrlist[ i ] );
	}
	
	return (item.declarations && item.declarations.length && item.mSelectorText) || (item.cssRules && item.cssRules.length);
}

function recolor_css( source, params )
{
	var parser = new CSSParser();
	var sheet = parser.parse( source, false, true );
	
	var errlist = [];
	rc_process( sheet, params, errlist );
	
	var out = "";
	for( var i = 0; i < errlist.length; ++i )
	{
		out += "/* ERROR: " + errlist[i] + " */\n";
	}
	out += sheet.cssText();
	return out;
}


// COLOR API

function sign( x ){ return x == 0 ? 0 : ( x < 0 ? -1 : 1 ); }
function abs( x ){ return Math.abs( x ); }
function lerp( a, b, q ){ return a * (1-q) + b * q; }
function smoothstep( x ){ return x*x*(3 - 2*x); }

function color_add( color1, color2 )
{
	return [
		color1[0] + color2[0],
		color1[1] + color2[1],
		color1[2] + color2[2],
		color1[3] + color2[3]
	]
}

function color_sub( color1, color2 )
{
	return [
		color1[0] - color2[0],
		color1[1] - color2[1],
		color1[2] - color2[2],
		color1[3] - color2[3]
	]
}

function color_mul( color1, color2 )
{
	return [
		color1[0] * color2[0] / 255,
		color1[1] * color2[1] / 255,
		color1[2] * color2[2] / 255,
		color1[3] * color2[3]
	]
}

function color_div( color1, color2 )
{
	return [
		color1[0] / color2[0],
		color1[1] / color2[1],
		color1[2] / color2[2],
		color1[3] / color2[3]
	]
}

function color_mod( color1, color2 )
{
	return [
		color1[0] % color2[0],
		color1[1] % color2[1],
		color1[2] % color2[2],
		color1[3] % color2[3]
	]
}

function color_pow( color1, color2 )
{
	return [
		Math.pow( Math.abs( color1[0] ) / 255, color2[0] ) * sign( color1[0] ) * 255,
		Math.pow( Math.abs( color1[1] ) / 255, color2[1] ) * sign( color1[1] ) * 255,
		Math.pow( Math.abs( color1[2] ) / 255, color2[2] ) * sign( color1[2] ) * 255,
		Math.pow( color1[3], color2[3] )
	]
}

function color_lerp( color1, color2, q )
{
	return [
		lerp( color1[0], color2[0], q ),
		lerp( color1[1], color2[1], q ),
		lerp( color1[2], color2[2], q ),
		lerp( color1[3], color2[3], q )
	]
}

function color_shift( color1, color2 )
{
	return [
		close255( color1[0] + color2[0] ),
		close255( color1[1] + color2[1] ),
		close255( color1[2] + color2[2] ),
		color1[3] + color2[3]
	];
}

function color_rgb_value_shift( color1, val )
{
	var avg = ( color1[0] + color1[1] + color1[2] ) / 3;
	var res = close255( avg + val );
	val = res - avg;
	return [
		color1[0] + val,
		color1[1] + val,
		color1[2] + val,
		color1[3]
	];
}

function color_rgb_value_invert( color1, scale )
{
	scale = scale || 1;
	var avg = ( color1[0] + color1[1] + color1[2] ) / 3;
	var res = 255 - avg;
	var val = res - avg;
	return [
		color1[0] + val * scale,
		color1[1] + val * scale,
		color1[2] + val * scale,
		color1[3]
	];
}

function color_soft_contrast( color1, val )
{
	var color2 = [
		smoothstep( color1[0] / 255 ) * 255,
		smoothstep( color1[1] / 255 ) * 255,
		smoothstep( color1[2] / 255 ) * 255,
		smoothstep( color1[3] )
	];
	return color_lerp( color1, color2, val );
}

function color_cut_contrast( color1, val )
{
	var color2 = [
		color1[0] < 128 ? color1[0] / 2 : 255 - ( 255 - color1[0] ) / 2,
		color1[1] < 128 ? color1[1] / 2 : 255 - ( 255 - color1[1] ) / 2,
		color1[2] < 128 ? color1[2] / 2 : 255 - ( 255 - color1[2] ) / 2,
		color1[3] < 0.5 ? color1[3] / 2 : 1 - ( 1 - color1[3] ) / 2
	];
	return color_lerp( color1, color2, val );
}

