/*
	Copyright 2011 Vicomtech

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

#ifdef GL_ES
precision highp float;
#endif

varying vec4 frontColor;
varying vec4 pos;

uniform sampler2D uBackCoord;
uniform sampler2D uVolData;
uniform sampler2D uTransferFunction;
uniform vec2 uOffset; //The pixel size of the volume data texture

//Edge enhacement options 
//To calculate the camera position
uniform mat4 uInvMVMatrix;
uniform float uGradientThreshold; //[0,pi]
uniform vec3 uEdgeColor; //[[0,1],..]

//Defined constants
const float steps = 80.0;
const float numberOfSlices = 41.0;
const float slicesOverX = 7.0;
const float slicesOverY = 7.0;

/**
* Edge Enhancement Style
* The opacity stays unmodified after the edge enhacenment.
* @param edgeColor The color to use for the edge enhancement
* @param gradientThreshold 
* @param originalColor The base color that will be enhancement
* @param gradient The gradient vector or surface normals
* @param V The camera direction, (normalized)
*/
void EdgeEnhacement(inout vec3 originalColor, vec3 edgeColor, float gradientThreshold, vec3 gradient, vec3 V)
{	
	float angle_dif = abs(dot(gradient,V));
	if (angle_dif<=cos(gradientThreshold)){
		originalColor = mix(edgeColor, originalColor, angle_dif);
	}
}

/**
* Gets a voxel's scalar value, given a position on the volume
*
* @param volpos The position inside the volume
* @return An scalar value for the given voxel
*/
float getVolumeValue(vec3 volpos)
{
	float s1,s2;
	float dx1,dy1;
	float dx2,dy2;

	vec2 texpos1,texpos2;

	s1 = floor(volpos.z*numberOfSlices);
	s2 = s1+1.0;

	dx1 = fract(s1/slicesOverX);
	dy1 = floor(s1/slicesOverY)/slicesOverY;

	dx2 = fract(s2/slicesOverX);
	dy2 = floor(s2/slicesOverY)/slicesOverY;
	
	texpos1.x = dx1+(volpos.x/slicesOverX);
	texpos1.y = dy1+(volpos.y/slicesOverY);

	texpos2.x = dx2+(volpos.x/slicesOverX);
	texpos2.y = dy2+(volpos.y/slicesOverY);

	return mix( texture2D(uVolData,texpos1).x, texture2D(uVolData,texpos2).x, (volpos.z*numberOfSlices)-s1);
}


/**
* Calculate the gradient for the isovalues of the voxel data
* using forward differences.
*/
vec3 forwardGradientForIsovalues(vec3 voxPos, vec3 offset) {
	float v = getVolumeValue(voxPos);
	float v0 = getVolumeValue(voxPos + vec3(offset.x, 0, 0));
	float v1 = getVolumeValue(voxPos + vec3(0, offset.y, 0));
	float v2 = getVolumeValue(voxPos + vec3(0, 0, offset.z));
	return vec3(v0-v, v1-v, v2-v);
}

/**
* Calculate the gradient for the isovalues of the voxel data
* using forward differences.
*/
vec3 centralGradientForIsovalues(vec3 voxPos, vec3 offset) {
	float v0 = getVolumeValue(voxPos + vec3(offset.x, 0, 0));
	float v1 = getVolumeValue(voxPos - vec3(offset.x, 0, 0));

	float v2 = getVolumeValue(voxPos + vec3(0, offset.y, 0));
	float v3 = getVolumeValue(voxPos - vec3(0, offset.y, 0));

	float v4 = getVolumeValue(voxPos + vec3(0, 0, offset.z));
	float v5 = getVolumeValue(voxPos - vec3(0, 0, offset.z));
	return vec3((v0-v1)/2.0, (v2-v3)/2.0, (v4-v5)/2.0);
}

void main(void)
{
	vec2 texC = pos.xy/pos.w;
	texC.x = 0.5*texC.x + 0.5;
	texC.y = 0.5*texC.y + 0.5;

	vec4 backColor = texture2D(uBackCoord,texC);

	vec3 dir = backColor.rgb - frontColor.rgb;
	vec4 vpos = frontColor;
  	
  	//Obtain the camera position from the inversed modelview matrix
  	vec3 cam_pos = vec3(uInvMVMatrix[3][0], uInvMVMatrix[3][1], uInvMVMatrix[3][2]);
  	//The offset on 3d space
  	vec3 offset = vec3(uOffset.x, uOffset.y, max(uOffset.x, uOffset.y))*1.0;

  	float cont = 0.0;

	vec3 Step = dir/steps;

	vec4 accum = vec4(0, 0, 0, 0);
	vec4 sample = vec4(0.0, 0.0, 0.0, 0.0);
 	vec4 value = vec4(0, 0, 0, 0);

	float opacityFactor = 8.0;
	float lightFactor = 1.3;

	for(float i = 0.0; i < steps; i+=1.0)
	{
		vec2 tf_pos;

		tf_pos.x = getVolumeValue(vpos.xyz);		
		tf_pos.y = 0.5;
		
		value = texture2D(uTransferFunction,tf_pos);
		//aarbelaiz
		vec3 grad = centralGradientForIsovalues(vpos.xyz, offset);
		vec4 n = vec4(grad, 0.0);
  		n.a = length(n.xyz);
  		if (n.a>0.0001)
    		n.xyz = normalize(n.xyz);

		// Process the volume sample
		sample.a = value.a * opacityFactor * (1.0/steps);
		EdgeEnhacement(value.rgb, uEdgeColor, uGradientThreshold, n.xyz, normalize(dir));
		sample.rgb = value.rgb * sample.a * lightFactor;
		//~aarbelaiz;
						
		accum.rgb += (1.0 - accum.a) * sample.rgb;
		accum.a += sample.a;

		//advance the current position
		vpos.xyz += Step;

		//break if the position is greater than <1, 1, 1>
		if(vpos.x > 1.0 || vpos.y > 1.0 || vpos.z > 1.0 || accum.a>=1.0)
		    break;


	}

	gl_FragColor = accum;
}
